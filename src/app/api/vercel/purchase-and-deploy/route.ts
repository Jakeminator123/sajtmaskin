/**
 * Vercel Purchase and Deploy API
 * ==============================
 * POST /api/vercel/purchase-and-deploy
 * Combines domain purchase, project deployment, and domain assignment in one flow
 */

import { NextRequest, NextResponse } from "next/server";
import { deployProject } from "@/lib/vercel/vercel-deployment-service";
import {
  isVercelConfigured,
  getDomainPrice,
  purchaseDomain,
  getDomainOrderStatus,
  addDomainToProject,
  getProject,
  DomainContactInfo,
} from "@/lib/vercel/vercel-client";
import { getProjectById } from "@/lib/data/database";
import { saveDomainOrder, updateDomainOrderStatus } from "@/lib/data/database";

const USD_TO_SEK = 11; // Approximate conversion rate
const MARKUP_MULTIPLIER = 3; // 300% markup

/**
 * Poll order status until completion or timeout
 */
async function waitForOrderCompletion(
  orderId: string,
  teamId?: string,
  maxWaitTime = 300000, // 5 minutes (increased from 2)
  pollInterval = 3000 // 3 seconds (increased from 2)
): Promise<{ success: boolean; status: string; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const orderStatus = await getDomainOrderStatus(orderId, teamId);

      if (
        orderStatus.status === "completed" ||
        orderStatus.status === "success"
      ) {
        return { success: true, status: orderStatus.status };
      }

      if (orderStatus.status === "failed" || orderStatus.status === "error") {
        return {
          success: false,
          status: orderStatus.status,
          error: orderStatus.error || "Domain purchase failed",
        };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(
        "[API/vercel/purchase-and-deploy] Error polling order:",
        error
      );
      // Continue polling on error
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  return {
    success: false,
    status: "timeout",
    error: "Order completion timeout - please check order status manually",
  };
}

/**
 * Internal function to purchase domain (called directly, not via HTTP)
 */
async function purchaseDomainInternal(
  domain: string,
  contactInfo: DomainContactInfo,
  years: number,
  teamId?: string
): Promise<{
  success: boolean;
  orderId?: string;
  domain?: string;
  customerPrice?: number;
  vercelCost?: number;
  currency?: string;
  status?: string;
  error?: string;
}> {
  try {
    // Get Vercel's cost for the domain
    const vercelPriceData = await getDomainPrice(domain, teamId);

    // Calculate customer price (300% markup)
    const vercelCostUsd = vercelPriceData.price;
    const vercelCostSek = vercelCostUsd * USD_TO_SEK;
    const customerPriceSek = Math.round(vercelCostSek * MARKUP_MULTIPLIER);

    console.log(
      `[API/vercel/purchase-and-deploy] Pricing: Vercel cost: ${vercelCostUsd} USD (${vercelCostSek} SEK), Customer price: ${customerPriceSek} SEK`
    );

    // Purchase domain via Vercel API
    const purchaseResult = await purchaseDomain(domain, {
      years,
      autoRenew: true,
      expectedPrice: vercelCostUsd,
      contactInformation: contactInfo,
      teamId,
    });

    console.log(
      "[API/vercel/purchase-and-deploy] Purchase initiated, order ID:",
      purchaseResult.orderId
    );

    // Wait for order completion
    const orderResult = await waitForOrderCompletion(
      purchaseResult.orderId,
      teamId
    );

    if (!orderResult.success) {
      return {
        success: false,
        error:
          orderResult.error || "Domain purchase did not complete successfully",
        orderId: purchaseResult.orderId,
        status: orderResult.status,
      };
    }

    return {
      success: true,
      orderId: purchaseResult.orderId,
      domain: purchaseResult.domain,
      customerPrice: customerPriceSek,
      vercelCost: vercelCostSek,
      currency: "SEK",
      status: orderResult.status,
    };
  } catch (error) {
    console.error(
      "[API/vercel/purchase-and-deploy] Domain purchase failed:",
      error
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to purchase domain. Please check your payment method.";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Allow up to 5 minutes for the entire flow
export const maxDuration = 300;

interface PurchaseAndDeployRequest {
  projectId: string;
  domain: string;
  years?: number;
  contactInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    state?: string;
    zip: string;
    country: string;
  };
  projectName?: string;
  framework?: string;
  teamId?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check if Vercel is configured
    if (!isVercelConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Vercel integration not configured. Set VERCEL_API_TOKEN.",
        },
        { status: 503 }
      );
    }

    const body: PurchaseAndDeployRequest = await request.json();
    const {
      projectId,
      domain,
      years = 1,
      contactInfo,
      projectName,
      framework,
      teamId,
    } = body;

    // Validate required fields
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { success: false, error: "domain is required" },
        { status: 400 }
      );
    }

    if (!contactInfo || typeof contactInfo !== "object") {
      return NextResponse.json(
        { success: false, error: "contactInfo is required" },
        { status: 400 }
      );
    }

    // Normalize contact info and ensure required fields are non-empty
    const normalizedContactInfo: DomainContactInfo = {
      ...contactInfo,
      firstName: contactInfo.firstName?.trim() || "",
      lastName: contactInfo.lastName?.trim() || "",
      email: contactInfo.email?.trim() || "",
      phone: contactInfo.phone?.trim() || "",
      address1: contactInfo.address1?.trim() || "",
      city: contactInfo.city?.trim() || "",
      zip: contactInfo.zip?.trim() || "",
      country: contactInfo.country?.trim() || "SE",
      // Vercel requires a non-empty state even for TLDs like .se
      state:
        contactInfo.state?.trim() ||
        contactInfo.city?.trim() ||
        "-",
    };

    // Verify project exists
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Validate required contact fields (including normalized fallback state)
    const requiredContactFields: Array<keyof DomainContactInfo> = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "address1",
      "city",
      "zip",
      "country",
      "state",
    ];

    for (const field of requiredContactFields) {
      if (!normalizedContactInfo[field]) {
        return NextResponse.json(
          { success: false, error: `contactInfo.${field} is required` },
          { status: 400 }
        );
      }
    }

    // Use project name if not provided
    const finalProjectName =
      projectName ||
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .substring(0, 53);

    console.log(
      `[API/vercel/purchase-and-deploy] Starting purchase and deploy for project ${projectId}, domain ${domain}`
    );

    // Step 1: Purchase domain (using internal function, not HTTP)
    const purchaseResult = await purchaseDomainInternal(
      domain,
      normalizedContactInfo,
      years,
      teamId
    );

    if (!purchaseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: purchaseResult.error || "Domain purchase failed",
          step: "purchase",
        },
        { status: 500 }
      );
    }

    console.log(
      `[API/vercel/purchase-and-deploy] Domain purchased: ${domain}, order: ${purchaseResult.orderId}`
    );

    // Save domain order to database
    const orderId = crypto.randomUUID();
    try {
      saveDomainOrder({
        id: orderId,
        project_id: projectId,
        domain,
        order_id: purchaseResult.orderId || null,
        customer_price: purchaseResult.customerPrice || 0,
        vercel_cost: purchaseResult.vercelCost || 0,
        currency: purchaseResult.currency || "SEK",
        status: purchaseResult.status || "completed",
        years,
        domain_added_to_project: false, // Will be set to true after deployment
      });
    } catch (dbError) {
      console.error(
        "[API/vercel/purchase-and-deploy] Failed to save order to database:",
        dbError
      );
      // Continue anyway - order is saved in Vercel
    }

    // Step 2: Deploy project (without domain first - we'll add it after)
    let deploymentResult;
    try {
      console.log(
        `[API/vercel/purchase-and-deploy] Deploying project ${projectId}`
      );

      // Deploy without domain first to ensure project exists
      deploymentResult = await deployProject({
        projectId,
        projectName: finalProjectName,
        framework: framework || "nextjs",
        target: "production",
        // Don't pass domain here - we'll add it after deployment is ready
        teamId,
      });

      if (!deploymentResult.success) {
        throw new Error(deploymentResult.error || "Deployment failed");
      }

      console.log(
        `[API/vercel/purchase-and-deploy] Deployment successful: ${deploymentResult.deploymentId}`
      );
    } catch (error) {
      console.error(
        "[API/vercel/purchase-and-deploy] Deployment failed:",
        error
      );

      // Update order status - domain purchased but deployment failed
      try {
        updateDomainOrderStatus(orderId, "deployment_failed");
      } catch {
        // Ignore DB errors
      }

      const errorMessage =
        error instanceof Error ? error.message : "Deployment failed";
      return NextResponse.json(
        {
          success: false,
          error: `Deployment failed: ${errorMessage}`,
          step: "deployment",
          domain: purchaseResult.domain,
          orderId: purchaseResult.orderId,
          // Domain is purchased but deployment failed
          // User can deploy manually later and add domain
        },
        { status: 500 }
      );
    }

    // Step 3: Add domain to project after deployment is ready
    let domainAdded = false;
    let customDomainUrl: string | undefined;
    try {
      // Get Vercel project
      const vercelProject = await getProject(finalProjectName, teamId);

      // Add domain to project
      await addDomainToProject(vercelProject.id, domain, teamId);
      domainAdded = true;
      customDomainUrl = `https://${domain}`;

      console.log(
        `[API/vercel/purchase-and-deploy] Domain ${domain} added to project ${vercelProject.id}`
      );

      // Update order status
      try {
        updateDomainOrderStatus(
          orderId,
          "completed",
          purchaseResult.orderId,
          true
        );
      } catch (dbError) {
        console.error(
          "[API/vercel/purchase-and-deploy] Failed to update order status:",
          dbError
        );
      }
    } catch (domainError) {
      console.error(
        "[API/vercel/purchase-and-deploy] Failed to add domain to project:",
        domainError
      );
      // Don't fail the entire flow - domain is purchased and deployment succeeded
      // Domain can be added manually later
    }

    return NextResponse.json({
      success: true,
      domain,
      deploymentId: deploymentResult.deploymentId,
      deploymentUrl: deploymentResult.url,
      customDomainUrl: customDomainUrl || `https://${domain}`,
      orderId: purchaseResult.orderId,
      customerPrice: purchaseResult.customerPrice,
      vercelCost: purchaseResult.vercelCost,
      currency: purchaseResult.currency || "SEK",
      domainAdded,
      // Warn if domain wasn't added
      ...(domainAdded
        ? {}
        : {
            warning:
              "Domain purchased and deployment successful, but domain could not be automatically added to project. Please add it manually in Vercel dashboard.",
          }),
    });
  } catch (error) {
    console.error("[API/vercel/purchase-and-deploy] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
