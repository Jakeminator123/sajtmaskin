import { NextRequest, NextResponse } from "next/server";
import { getCategory, getTemplatesForCategory, CATEGORIES } from "@/lib/template-data";

/**
 * GET /api/templates
 * List templates, optionally filtered by category
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

    return NextResponse.json({
      category: {
        id: category.id,
        title: category.title,
        description: category.description,
      },
      templates: category.templates,
    });
  }

  // Return all categories with their templates
  const categoriesData = Object.values(CATEGORIES).map((cat) => ({
    id: cat.id,
    title: cat.title,
    description: cat.description,
    templateCount: cat.templates.length,
    templates: cat.templates,
  }));

  return NextResponse.json({
    categories: categoriesData,
  });
}

