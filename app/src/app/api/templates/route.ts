import { NextRequest, NextResponse } from "next/server";
import { getCategory, CATEGORIES } from "@/lib/template-data";
import {
  getTemplatesForCategory,
  getAllTemplates,
  CURATED_TEMPLATES,
} from "@/lib/curated-templates";

/**
 * GET /api/templates
 * List curated templates, optionally filtered by category
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const categoryId = searchParams.get("category");

  // If category is specified, return templates for that category
  if (categoryId) {
    const category = getCategory(categoryId);
    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    const templates = getTemplatesForCategory(categoryId);

    return NextResponse.json({
      category: {
        id: category.id,
        title: category.title,
        description: category.description,
      },
      templates,
    });
  }

  // Return all categories with their templates
  const categoriesData = Object.keys(CATEGORIES).map((catId) => {
    const cat = CATEGORIES[catId];
    const templates = getTemplatesForCategory(catId);
    return {
      id: cat.id,
      title: cat.title,
      description: cat.description,
      templateCount: templates.length,
      templates,
    };
  });

  return NextResponse.json({
    categories: categoriesData,
    totalTemplates: getAllTemplates().length,
  });
}
