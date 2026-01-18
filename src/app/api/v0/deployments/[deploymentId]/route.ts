import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { deployments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getVercelDeployment, mapVercelReadyStateToStatus } from '@/lib/vercelDeploy';
import { updateDeploymentStatus } from '@/lib/deployment';
import { getChatByIdForRequest } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ deploymentId: string }> }
) {
  try {
    const { deploymentId } = await ctx.params;

    const result = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const deployment = result[0];

    const chat = await getChatByIdForRequest(req, deployment.chatId);
    if (!chat) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const currentStatus = (deployment.status as any) || 'pending';
    const isTerminal =
      currentStatus === 'ready' || currentStatus === 'error' || currentStatus === 'cancelled';

    if (deployment.vercelDeploymentId && !isTerminal) {
      try {
        const vercel = await getVercelDeployment(deployment.vercelDeploymentId);
        const mapped = mapVercelReadyStateToStatus(vercel.readyState);

        try {
          await updateDeploymentStatus(deploymentId, mapped.status, {
            url: vercel.url ?? undefined,
            inspectorUrl: vercel.inspectorUrl ?? undefined,
            vercelProjectId: vercel.vercelProjectId ?? undefined,
          });
        } catch (dbErr) {
          console.error('Failed to persist deployment status:', dbErr);
        }

        return NextResponse.json({
          id: deployment.id,
          chatId: deployment.chatId,
          versionId: deployment.versionId,
          status: mapped.status,
          url: vercel.url ?? deployment.url,
          inspectorUrl: vercel.inspectorUrl ?? deployment.inspectorUrl,
          vercelDeploymentId: deployment.vercelDeploymentId,
          vercelProjectId: vercel.vercelProjectId ?? deployment.vercelProjectId,
          readyState: vercel.readyState,
          createdAt: deployment.createdAt,
          updatedAt: new Date(),
        });
      } catch (vercelErr) {
        console.error('Failed to refresh deployment status from Vercel:', vercelErr);
      }
    }

    return NextResponse.json({
      id: deployment.id,
      chatId: deployment.chatId,
      versionId: deployment.versionId,
      status: deployment.status,
      url: deployment.url,
      inspectorUrl: deployment.inspectorUrl,
      vercelDeploymentId: deployment.vercelDeploymentId,
      vercelProjectId: deployment.vercelProjectId,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    });
  } catch (err) {
    console.error('Get deployment error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
