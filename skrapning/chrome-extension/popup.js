const SERVER_URL = 'http://localhost:5000';

// Inject content script if not already loaded
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    // Content script not loaded, inject it
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    // Wait for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Extract category from URL
function getCategoryFromUrl(url) {
  const categoryMap = {
    'landing-pages': 'Landing Pages',
    'hero-sections': 'Hero Sections',
    'forms': 'Forms',
    'dashboards': 'Dashboards',
    'ecommerce': 'E-commerce',
    'pricing': 'Pricing',
    'features': 'Features',
    'login': 'Login & Sign Up',
    'sign-up': 'Login & Sign Up',
    'apps': 'Apps & Games',
    'games': 'Apps & Games',
    'components': 'Components',
    'blog': 'Blog',
    'portfolio': 'Portfolio',
    'saas': 'SaaS',
    'marketing': 'Marketing',
    'agency': 'Agency'
  };
  
  const urlPath = new URL(url).pathname;
  for (const [key, value] of Object.entries(categoryMap)) {
    if (urlPath.includes(key)) {
      return value;
    }
  }
  return 'Templates';
}

document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('v0.app/templates')) {
    showStatus('error', 'Öppna en v0.app templates-sida först!');
    return;
  }

  showStatus('info', 'Extraherar templates...');
  document.getElementById('progress').style.display = 'block';
  
  try {
    // Ensure content script is loaded
    await ensureContentScript(tab.id);
    
    // Get category from current URL
    const category = getCategoryFromUrl(tab.url);
    
    // Send message to content script to extract templates
    const extractResponse = await chrome.tabs.sendMessage(tab.id, { 
      action: 'extractTemplates',
      category: category 
    });
    const templates = extractResponse.templates;
    
    if (!templates || templates.length === 0) {
      showStatus('error', 'Inga templates hittades!');
      return;
    }

    document.getElementById('progressText').textContent = `Hittade ${templates.length} templates (${category}). Skickar till server...`;

    // Send to local server
    const serverResponse = await fetch(`${SERVER_URL}/api/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ templates, category })
    });

    if (serverResponse.ok) {
      const data = await serverResponse.json();
      showStatus('success', `✓ Sparat ${templates.length} templates!`);
      document.getElementById('progressText').textContent = `Sparat i: ${data.output_dir}`;
    } else {
      throw new Error('Server error: ' + serverResponse.statusText);
    }
  } catch (error) {
    showStatus('error', 'Fel: ' + error.message);
    console.error(error);
  }
});

document.getElementById('scrollBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('v0.app/templates')) {
    showStatus('error', 'Öppna en v0.app templates-sida först!');
    return;
  }

  showStatus('info', 'Scrollar och laddar templates...');
  
  try {
    // Ensure content script is loaded
    await ensureContentScript(tab.id);
    
    await chrome.tabs.sendMessage(tab.id, { action: 'autoScroll' });
    showStatus('success', 'Scrollning klar! Klicka nu på "Scrape Templates"');
  } catch (error) {
    showStatus('error', 'Fel: ' + error.message);
  }
});

function showStatus(type, message) {
  const status = document.getElementById('status');
  status.className = `status ${type}`;
  status.textContent = message;
}
