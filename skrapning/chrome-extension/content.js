// Content script - runs on v0.app pages
console.log("V0 Template Scraper extension loaded!");

// Current category (set by popup)
let currentCategory = "Templates";

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request.action);

  // Ping to check if content script is loaded
  if (request.action === "ping") {
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "extractTemplates") {
    // Use category from popup if provided
    if (request.category) {
      currentCategory = request.category;
    }
    const templates = extractTemplatesFromDOM();
    console.log(
      "Extracted templates:",
      templates.length,
      "Category:",
      currentCategory
    );
    sendResponse({ templates: templates });
    return true;
  }

  if (request.action === "autoScroll") {
    autoScrollAndLoadMore().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Extract templates directly from the DOM
function extractTemplatesFromDOM() {
  const templates = [];
  const seen = new Set();

  // Find all template links
  const links = document.querySelectorAll('a[href^="/templates/"]');
  console.log("Found links:", links.length);

  links.forEach((link) => {
    const href = link.getAttribute("href");

    // Skip non-template links
    if (
      !href ||
      href === "/templates" ||
      href === "/templates/" ||
      href.includes("submissions")
    ) {
      return;
    }

    // Skip category pages like /templates/landing-pages (but not individual templates)
    const categoryPages = [
      "landing-pages",
      "hero-sections",
      "forms",
      "dashboards",
      "ecommerce",
      "pricing",
      "features",
    ];
    const parts = href.split("/");
    const lastPart = parts[parts.length - 1];

    if (categoryPages.includes(lastPart)) {
      return;
    }

    // Check if in sidebar
    const isInSidebar = link.closest("aside") !== null;
    if (isInSidebar) return;

    // Extract ID from slug
    // Format 1: /templates/pointer-ai-landing-page-XQxxv76lK5w (slug with ID at end)
    // Format 2: /templates/de7xnGLbDAh (just ID, no slug)
    const slug = lastPart;
    let id;

    if (slug.includes("-")) {
      // Has hyphen - ID is the last part after hyphen
      const idMatch = slug.match(/([A-Za-z0-9]{8,15})$/);
      id = idMatch ? idMatch[1] : slug;
    } else {
      // No hyphen - the whole thing is the ID
      id = slug;
    }

    if (seen.has(id)) return;
    seen.add(id);

    // Get title from link text
    let title = "";
    const textContent = link.textContent.trim();
    if (textContent && !textContent.includes("View Detail")) {
      // Clean up the title - remove stats
      title = textContent.replace(/\d+\.?\d*[KkMm]?/g, "").trim();
    }

    // Get stats (views, likes) from parent
    let views = "";
    let likes = "";
    const card = link.closest("div");
    if (card) {
      const text = card.textContent;
      const numbers = text.match(/(\d+\.?\d*[KkMm]?)/g);
      if (numbers && numbers.length >= 2) {
        views = numbers[0];
        likes = numbers[1];
      }
    }

    // Get preview image
    let imageUrl = "";

    // Try to find the image in parent elements (go up several levels)
    let searchElement = link;
    for (let i = 0; i < 5 && !imageUrl; i++) {
      searchElement = searchElement.parentElement;
      if (!searchElement) break;

      const img = searchElement.querySelector("img");
      if (img) {
        // Try src first (this is what we want)
        let src = img.getAttribute("src");

        if (src) {
          // Handle Next.js image optimization URLs
          // Format: /chat-static/_next/image?url=ENCODED_URL&w=...
          // or: /_next/image?url=ENCODED_URL&w=...
          if (src.includes("_next/image?url=")) {
            const match = src.match(/url=([^&]+)/);
            if (match) {
              try {
                // Decode the URL - it might be double encoded
                let decoded = decodeURIComponent(match[1]);
                // Sometimes it's double encoded
                if (decoded.includes("%")) {
                  decoded = decodeURIComponent(decoded);
                }
                imageUrl = decoded;
              } catch {
                // If decoding fails, try to extract from srcset
                const srcset = img.getAttribute("srcset");
                if (srcset) {
                  const srcsetMatch = srcset.match(/url=([^&]+)/);
                  if (srcsetMatch) {
                    try {
                      imageUrl = decodeURIComponent(srcsetMatch[1]);
                    } catch {
                      imageUrl = src;
                    }
                  }
                }
              }
            }
          } else if (src.includes("blob.vercel-storage.com")) {
            // Direct blob URL
            imageUrl = src;
          } else if (src.startsWith("http")) {
            imageUrl = src;
          } else if (src.startsWith("/")) {
            imageUrl = "https://v0.app" + src;
          }
        }

        // If we found a valid image URL, stop searching
        if (imageUrl && imageUrl.includes("blob.vercel-storage.com")) {
          break;
        }
      }
    }

    templates.push({
      id: id,
      title: title,
      slug: slug,
      view_url: "https://v0.app" + href,
      edit_url: "https://v0.app/chat/" + slug,
      preview_image_url: imageUrl,
      image_filename: imageUrl ? id + ".jpg" : null,
      views: views,
      likes: likes,
      author: "",
      author_avatar: "",
      category: currentCategory,
    });
  });

  return templates;
}

// Auto-scroll function
async function autoScrollAndLoadMore() {
  console.log("Starting auto-scroll...");

  for (let i = 0; i < 15; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const loadMoreBtn = Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Load More")
    );

    if (loadMoreBtn) {
      console.log("Clicking Load More...");
      loadMoreBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  window.scrollTo(0, 0);
  console.log("Auto-scroll complete!");
}
