import type { PreparedModule } from "./types";
import { isPreviewBuiltinImportSource } from "./constants";
import { normalizeFilePath, inferPreviewUiComponentName, resolveLocalImportPath } from "./utils";
import { buildCodeFileMap, buildPreparedModuleMap } from "./file-resolution";

export function buildPreviewPrelude(modules: PreparedModule[], routePath: string): string {
  const lines: string[] = [
    "const __previewRoot = document.getElementById('root');",
    "const __previewReportedErrors = new Set();",
    `const __previewPathname = ${JSON.stringify(routePath)};`,
    "function __previewPost(type, payload) {",
    "  try {",
    "    if (window.parent && window.parent !== window) {",
    "      window.parent.postMessage({ source: 'sajtmaskin-preview', type, payload }, '*');",
    "    }",
    "  } catch {",
    "    // ignore cross-window postMessage failures",
    "  }",
    "}",
    "function __previewReportError(error, meta) {",
    "  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? 'Okänt preview-fel');",
    "  const name = error && typeof error === 'object' && 'name' in error ? String(error.name || '') : '';",
    "  const stack = error && typeof error === 'object' && 'stack' in error ? String(error.stack || '') : '';",
    "  const kind = meta && typeof meta === 'object' && 'kind' in meta ? String(meta.kind || '') : 'runtime';",
    "  const code = meta && typeof meta === 'object' && 'code' in meta ? String(meta.code || '') : '';",
    "  const stage = meta && typeof meta === 'object' && 'stage' in meta ? String(meta.stage || '') : 'preview-script';",
    "  const source = meta && typeof meta === 'object' && 'source' in meta ? String(meta.source || '') : 'own-engine-preview';",
    "  const dedupeKey = [kind, name, message].join('::');",
    "  if (__previewReportedErrors.has(dedupeKey)) return;",
    "  __previewReportedErrors.add(dedupeKey);",
    "  __previewPost('preview-error', { message, name: name || null, stack: stack || null, kind, code: code || null, stage: stage || null, source: source || null });",
    "}",
    "function __previewShowError(error, meta) {",
    "  if (!__previewRoot) return;",
    "  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error ?? 'Okänt preview-fel');",
    "  __previewRoot.innerHTML = '<div style=\"padding:2rem;font-family:system-ui;color:#ef4444\"><h2 style=\"margin:0 0 1rem\">Preview-fel</h2><pre style=\"white-space:pre-wrap;font-size:13px;color:#a3a3a3\">' + message + '</pre></div>';",
    "  __previewReportError(error, meta);",
    "}",
    "const Image = (props = {}) => {",
    "  const { src, alt, style, onError, width, height, fill, ...rest } = props;",
    "  const w = width || (fill ? '100%' : 400);",
    "  const h = height || (fill ? '100%' : 300);",
    "  const isLocalPlaceholder = typeof src === 'string' && src.startsWith('/placeholder');",
    "  const isAiAsset = typeof src === 'string' && src.startsWith('/ai/');",
    "  const [failed, setFailed] = React.useState(false);",
    "  const placeholderStyle = {",
    "    width: typeof w === 'number' ? w + 'px' : w,",
    "    height: typeof h === 'number' ? h + 'px' : h,",
    "    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',",
    "    display: 'flex', alignItems: 'center', justifyContent: 'center',",
    "    flexDirection: 'column', gap: '8px', borderRadius: '8px',",
    "    color: '#64748b', fontSize: '14px', textAlign: 'center',",
    "    padding: '16px', overflow: 'hidden',",
    "    ...style,",
    "  };",
    "  if (isAiAsset || (!src && !isLocalPlaceholder)) {",
    "    return React.createElement('div', { ...rest, style: placeholderStyle },",
    "      React.createElement('span', { style: { fontSize: '24px' } }, '\\uD83D\\uDDBC'),",
    "      React.createElement('span', null, alt || 'Image placeholder'),",
    "    );",
    "  }",
    "  if (failed) {",
    "    return React.createElement('div', { ...rest, style: placeholderStyle },",
    "      React.createElement('span', null, alt || 'Image failed to load'),",
    "    );",
    "  }",
    "  const imgStyle = { ...style, width: typeof w === 'number' ? w + 'px' : w, height: typeof h === 'number' ? h + 'px' : h, objectFit: 'cover' };",
    "  return React.createElement('img', { ...rest, src, alt: alt || '', style: imgStyle, onError: () => setFailed(true) });",
    "};",
    "const Link = ({ href, children, onClick, ...props }) => React.createElement('a', { href: href || '#', ...props, onClick: (e) => {",
    "  onClick?.(e);",
    "  if (e.defaultPrevented) return;",
    "  const rawHref = typeof href === 'string' ? href : '';",
    "  const isInternal = rawHref.startsWith('/') || rawHref.startsWith('./') || rawHref.startsWith('../');",
    "  if (!isInternal) return;",
    "  e.preventDefault();",
    "  let nextHref = rawHref || '/';",
    "  try {",
    "    nextHref = new URL(rawHref, 'https://preview.local' + (__previewPathname.endsWith('/') ? __previewPathname : __previewPathname + '/')).pathname || '/';",
    "  } catch {",
    "    nextHref = rawHref || '/';",
    "  }",
    "  if (typeof __previewPost === 'function') __previewPost('navigation-attempt', { href: nextHref });",
    "} }, children);",
    "const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: async () => {} });",
    "const usePathname = () => __previewPathname;",
    "const useSearchParams = () => new URLSearchParams();",
    "window.addEventListener('error', (event) => {",
    "  if (__previewRoot && !__previewRoot.hasChildNodes()) __previewShowError(event.error ?? event.message, { kind: 'runtime', code: 'preview_runtime_error', stage: 'preview-script', source: 'own-engine-preview' });",
    "});",
    "window.addEventListener('unhandledrejection', (event) => {",
    "  if (__previewRoot && !__previewRoot.hasChildNodes()) __previewShowError(event.reason ?? event, { kind: 'runtime', code: 'preview_runtime_error', stage: 'preview-script', source: 'own-engine-preview' });",
    "});",
    "class __PreviewErrorBoundary extends React.Component {",
    "  constructor(props) {",
    "    super(props);",
    "    this.state = { error: null };",
    "  }",
    "  static getDerivedStateFromError(error) {",
    "    return { error };",
    "  }",
    "  componentDidCatch(error) {",
    "    console.error('Preview render error:', error);",
    "    __previewReportError(error, { kind: 'react-render', code: 'preview_react_render_error', stage: 'preview-script', source: 'own-engine-preview' });",
    "  }",
    "  render() {",
    "    if (this.state?.error) {",
    "      const message = this.state.error?.message ? String(this.state.error.message) : String(this.state.error);",
    "      return React.createElement('div', { style: { padding: '2rem', fontFamily: 'system-ui', color: '#ef4444' } },",
    "        React.createElement('h2', { style: { margin: '0 0 1rem' } }, 'Preview-fel'),",
    "        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', color: '#a3a3a3' } }, message),",
    "      );",
    "    }",
    "    return this.props.children;",
    "  }",
    "}",
    "function __previewCn(...values) {",
    "  const parts = [];",
    "  const visit = (value) => {",
    "    if (!value) return;",
    "    if (typeof value === 'string') { parts.push(value); return; }",
    "    if (Array.isArray(value)) { value.forEach(visit); return; }",
    "    if (typeof value === 'object') { for (const [key, enabled] of Object.entries(value)) { if (enabled) parts.push(key); } }",
    "  };",
    "  values.forEach(visit);",
    "  return parts.join(' ');",
    "}",
    "function __previewPrimitive(tag, defaults) {",
    "  const component = React.forwardRef(function PreviewPrimitive(props, ref) {",
    "    const { asChild, children, ...rest } = props || {};",
    "    const nextProps = { ...(defaults || {}), ...rest, ref };",
    "    if (asChild && React.isValidElement(children)) {",
    "      return React.cloneElement(children, { ...nextProps, ...children.props });",
    "    }",
    "    if (tag === 'input' || tag === 'img') return React.createElement(tag, nextProps);",
    "    return React.createElement(tag, nextProps, children);",
    "  });",
    "  return component;",
    "}",
    "function __previewStyled(tag, baseStyle, defaults) {",
    "  return React.forwardRef(function StyledPreview(props, ref) {",
    "    const { asChild, children, className, style, variant, size, ...rest } = props || {};",
    "    const merged = { ...baseStyle, ...style };",
    "    const nextProps = { ...(defaults || {}), ...rest, ref, style: merged, className };",
    "    if (asChild && React.isValidElement(children)) {",
    "      return React.cloneElement(children, { ...nextProps, ...children.props });",
    "    }",
    "    if (tag === 'input' || tag === 'img' || tag === 'textarea' || tag === 'hr') return React.createElement(tag, nextProps);",
    "    return React.createElement(tag, nextProps, children);",
    "  });",
    "}",
    "function __previewSurface(baseStyle, defaults) {",
    "  return __previewStyled('div', {",
    "    position: 'relative',",
    "    display: 'block',",
    "    marginTop: '8px',",
    "    padding: '12px',",
    "    borderRadius: __s.radius,",
    "    border: '1px solid var(--border)',",
    "    background: 'color-mix(in oklab, var(--card) 92%, transparent)',",
    "    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',",
    "    ...baseStyle,",
    "  }, defaults);",
    "}",
    "const __previewSidebarDefaultContext = { state: 'expanded', open: true, setOpen: function(){}, openMobile: false, setOpenMobile: function(){}, isMobile: false, toggleSidebar: function(){}, collapsible: 'offcanvas', variant: 'sidebar', side: 'left' };",
    "const __PreviewSidebarContext = React.createContext(__previewSidebarDefaultContext);",
    "function useSidebar() {",
    "  return React.useContext(__PreviewSidebarContext) || __previewSidebarDefaultContext;",
    "}",
    "function SidebarProvider(props) {",
    "  var { defaultOpen, open: openProp, onOpenChange, previewMobile, className, style, children, ...rest } = props || {};",
    "  var isMobile = !!previewMobile;",
    "  var [openMobile, setOpenMobile] = React.useState(false);",
    "  var [localOpen, setLocalOpen] = React.useState(defaultOpen !== false);",
    "  var open = typeof openProp === 'boolean' ? openProp : localOpen;",
    "  var setOpen = React.useCallback(function(value) {",
    "    var next = typeof value === 'function' ? value(open) : value;",
    "    if (typeof onOpenChange === 'function') onOpenChange(next);",
    "    if (typeof openProp !== 'boolean') setLocalOpen(next);",
    "  }, [open, onOpenChange, openProp]);",
    "  var toggleSidebar = React.useCallback(function() { if (isMobile) setOpenMobile(function(current) { return !current; }); else setOpen(function(current) { return !current; }); }, [isMobile, setOpen, setOpenMobile]);",
    "  var ctx = { state: open ? 'expanded' : 'collapsed', open: open, setOpen: setOpen, openMobile: openMobile, setOpenMobile: setOpenMobile, isMobile: isMobile, toggleSidebar: toggleSidebar, collapsible: 'offcanvas', variant: 'sidebar', side: 'left' };",
    "  return React.createElement(__PreviewSidebarContext.Provider, { value: ctx }, React.createElement('div', { className: className, style: { display: 'flex', width: '100%', minHeight: '100%', gap: '12px', '--sidebar-width': '16rem', '--sidebar-width-icon': '3.5rem', '--sidebar-width-mobile': '18rem', ...style }, ...rest }, children));",
    "}",
    "function __previewSidebarIsIconCollapsed(sidebar) {",
    "  return !sidebar.isMobile && sidebar.collapsible === 'icon' && sidebar.state === 'collapsed';",
    "}",
    "function __previewSidebarShouldHideCollapsed(sidebar) {",
    "  return __previewSidebarIsIconCollapsed(sidebar);",
    "}",
    "function __previewSidebarCompactChildren(children) {",
    "  return React.Children.toArray(children).filter(function(child) {",
    "    if (!React.isValidElement(child)) return false;",
    "    return true;",
    "  });",
    "}",
    "function Sidebar(props) {",
    "  var { side, variant, collapsible, className, style, children, ...rest } = props || {};",
    "  var sidebar = useSidebar();",
    "  var resolvedSide = side || 'left';",
    "  var resolvedVariant = variant || 'sidebar';",
    "  var resolvedCollapsible = collapsible || 'offcanvas';",
    "  var collapsed = resolvedCollapsible !== 'none' && sidebar.state === 'collapsed';",
    "  var offcanvasHidden = !sidebar.isMobile && resolvedCollapsible === 'offcanvas' && collapsed;",
    "  var width = sidebar.isMobile ? '18rem' : resolvedCollapsible === 'none' ? '16rem' : __previewSidebarIsIconCollapsed({ ...sidebar, collapsible: resolvedCollapsible }) ? '3.5rem' : offcanvasHidden ? '0px' : '16rem';",
    "  var nextCtx = { ...sidebar, collapsible: resolvedCollapsible, variant: resolvedVariant, side: resolvedSide };",
    "  var body = React.createElement('aside', { className: className, 'data-side': resolvedSide, 'data-variant': resolvedVariant, 'data-collapsible': resolvedCollapsible, 'data-state': sidebar.state, style: { width: width, minWidth: width, display: sidebar.isMobile && !sidebar.openMobile ? 'none' : 'flex', flexDirection: 'column', gap: '8px', padding: offcanvasHidden ? '0px' : '8px', borderRadius: resolvedVariant === 'inset' ? '0.75rem' : 'var(--radius, 0.5rem)', border: offcanvasHidden ? 'none' : '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', overflow: 'hidden', transition: 'width 0.2s ease, opacity 0.2s ease', opacity: offcanvasHidden ? 0 : 1, margin: resolvedVariant === 'inset' ? '8px' : 0, ...(resolvedVariant === 'floating' || resolvedVariant === 'inset' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } : {}), ...style }, ...rest }, offcanvasHidden ? null : children);",
    "  return React.createElement(__PreviewSidebarContext.Provider, { value: nextCtx }, body);",
    "}",
    "function SidebarTrigger(props) {",
    "  var { children, onClick, className, style, ...rest } = props || {};",
    "  var sidebar = useSidebar();",
    "  return React.createElement('button', { type: 'button', className: className, onClick: function(event) { if (typeof onClick === 'function') onClick(event); sidebar.toggleSidebar(); }, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '9999px', border: '1px solid var(--border)', background: 'transparent', color: 'inherit', cursor: 'pointer', ...style }, ...rest }, children || React.createElement('span', { 'aria-hidden': 'true' }, '|||'));",
    "}",
    "function SidebarRail(props) {",
    "  var { className, style, ...rest } = props || {};",
    "  var sidebar = useSidebar();",
    "  if (sidebar.isMobile) return null;",
    "  return React.createElement('button', { type: 'button', className: className, onClick: function() { sidebar.toggleSidebar(); }, style: { alignSelf: 'stretch', width: '6px', border: 'none', borderRadius: '9999px', background: 'var(--border)', cursor: 'pointer', opacity: sidebar.collapsible === 'offcanvas' && sidebar.state === 'collapsed' ? 0.6 : 1, ...style }, ...rest });",
    "}",
    "function SidebarMenuSkeleton(props) {",
    "  var showIcon = !!(props && props.showIcon);",
    "  return React.createElement('div', { className: props?.className, style: { display: 'flex', alignItems: 'center', gap: '8px', height: '32px', padding: '0 8px' } }, showIcon ? React.createElement('div', { style: { width: '16px', height: '16px', borderRadius: '4px', background: 'var(--muted)' } }) : null, React.createElement('div', { style: { height: '12px', width: '70%', borderRadius: '9999px', background: 'var(--muted)' } }));",
    "}",
    "function SidebarGroupLabel(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('div', { ...props, style: { fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', padding: '0 4px', ...(props?.style || {}) } }, props?.children);",
    "}",
    "function SidebarGroupAction(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('button', { type: 'button', ...props, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: 'var(--radius, 0.5rem)', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', ...(props?.style || {}) } }, props?.children);",
    "}",
    "function SidebarMenuButton(props) {",
    "  var sidebar = useSidebar();",
    "  var collapsedIcon = __previewSidebarIsIconCollapsed(sidebar);",
    "  var { children, className, style, tooltip, ...rest } = props || {};",
    "  var content = collapsedIcon ? __previewSidebarCompactChildren(children) : children;",
    "  if (collapsedIcon && (!content || React.Children.count(content) === 0)) {",
    "    content = React.createElement('span', { 'aria-hidden': 'true' }, '•');",
    "  }",
    "  return React.createElement('button', { type: 'button', className: className, title: collapsedIcon && typeof tooltip === 'string' ? tooltip : undefined, style: { display: 'flex', width: collapsedIcon ? '32px' : '100%', minWidth: collapsedIcon ? '32px' : undefined, alignItems: 'center', justifyContent: collapsedIcon ? 'center' : 'flex-start', gap: '8px', borderRadius: 'var(--radius, 0.5rem)', border: 'none', background: 'transparent', color: 'inherit', padding: collapsedIcon ? '8px' : '8px 10px', fontSize: '14px', cursor: 'pointer', textAlign: 'left', ...(props?.style || {}) }, ...rest }, content);",
    "}",
    "function SidebarMenuAction(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('button', { type: 'button', ...props, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: 'var(--radius, 0.5rem)', border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', ...(props?.style || {}) } }, props?.children);",
    "}",
    "function SidebarMenuBadge(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('div', { ...props, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px', borderRadius: 'var(--radius, 0.5rem)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: '12px', padding: '0 6px', ...(props?.style || {}) } }, props?.children);",
    "}",
    "function SidebarMenuSub(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('ul', { ...props, style: { display: 'flex', flexDirection: 'column', gap: '4px', listStyle: 'none', margin: '4px 0 0 12px', padding: '0 0 0 10px', borderLeft: '1px solid var(--border)', ...(props?.style || {}) } }, props?.children);",
    "}",
    "function SidebarMenuSubButton(props) {",
    "  var sidebar = useSidebar();",
    "  if (__previewSidebarShouldHideCollapsed(sidebar)) return null;",
    "  return React.createElement('a', { ...props, style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '28px', borderRadius: 'var(--radius, 0.5rem)', color: 'inherit', textDecoration: 'none', padding: '4px 8px', fontSize: '13px', ...(props?.style || {}) } }, props?.children);",
    "}",
    "const __s = {",
    "  primary: 'var(--primary)',",
    "  primaryFg: 'var(--primary-foreground)',",
    "  secondary: 'var(--secondary)',",
    "  secondaryFg: 'var(--secondary-foreground)',",
    "  muted: 'var(--muted)',",
    "  mutedFg: 'var(--muted-foreground)',",
    "  card: 'var(--card)',",
    "  cardFg: 'var(--card-foreground)',",
    "  border: 'var(--border)',",
    "  bg: 'var(--background)',",
    "  fg: 'var(--foreground)',",
    "  destructive: 'var(--destructive)',",
    "  radius: 'var(--radius, 0.5rem)',",
    "};",
    "const __previewUiMap = {",
    "  Accordion: __previewPrimitive('div'),",
    "  AccordionContent: __previewStyled('div', { padding: '0 16px 16px' }),",
    "  AccordionItem: __previewStyled('div', { borderBottom: '1px solid ' + 'var(--border)' }),",
    "  AccordionTrigger: __previewStyled('button', { type: 'button', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', fontWeight: 500, fontSize: '14px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }),",
    "  Alert: __previewStyled('div', { border: '1px solid var(--border)', borderRadius: __s.radius, padding: '12px 16px' }),",
    "  AlertDescription: __previewStyled('div', { fontSize: '14px', color: __s.mutedFg }),",
    "  AlertTitle: __previewStyled('div', { fontWeight: 600, fontSize: '14px', marginBottom: '4px' }),",
    "  AspectRatio: function(props) { var ratio = typeof props?.ratio === 'number' && props.ratio > 0 ? props.ratio : 16 / 9; return React.createElement('div', { className: props?.className, style: { position: 'relative', width: '100%', paddingBottom: (100 / ratio) + '%', overflow: 'hidden', borderRadius: 'var(--radius, 0.5rem)', background: 'var(--muted)' } }, React.createElement('div', { style: { position: 'absolute', inset: 0 } }, props?.children)); },",
    "  Avatar: __previewStyled('div', { width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', background: __s.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),",
    "  AvatarFallback: __previewStyled('span', { fontSize: '14px', fontWeight: 500, color: __s.mutedFg }),",
    "  AvatarImage: __previewPrimitive('img'),",
    "  Badge: __previewStyled('span', { display: 'inline-flex', alignItems: 'center', borderRadius: '9999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600, background: __s.primary, color: __s.primaryFg, lineHeight: '1.5' }),",
    "  Breadcrumb: __previewStyled('nav', { display: 'block' }, { 'aria-label': 'Breadcrumb' }),",
    "  BreadcrumbItem: __previewStyled('li', { display: 'inline-flex', alignItems: 'center', gap: '6px' }),",
    "  BreadcrumbLink: __previewStyled('a', { color: 'inherit', textDecoration: 'none', fontWeight: 500 }),",
    "  BreadcrumbList: __previewStyled('ol', { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', listStyle: 'none', margin: 0, padding: 0, color: __s.mutedFg, fontSize: '14px' }),",
    "  BreadcrumbPage: __previewStyled('span', { color: __s.fg, fontWeight: 500 }),",
    "  BreadcrumbSeparator: __previewStyled('span', { color: __s.mutedFg }, { role: 'presentation', 'aria-hidden': 'true' }),",
    "  Button: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: __s.radius, padding: '8px 16px', fontSize: '14px', fontWeight: 500, background: __s.primary, color: __s.primaryFg, border: 'none', cursor: 'pointer', lineHeight: '1.5', whiteSpace: 'nowrap', transition: 'opacity 0.15s' }, { type: 'button' }),",
    "  Card: __previewStyled('div', { borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.card, color: __s.cardFg, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }),",
    "  CardContent: __previewStyled('div', { padding: '0 24px 24px' }),",
    "  CardDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg, margin: 0 }),",
    "  CardFooter: __previewStyled('div', { display: 'flex', alignItems: 'center', padding: '0 24px 24px' }),",
    "  CardHeader: __previewStyled('div', { padding: '24px 24px 8px' }),",
    "  CardTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600, lineHeight: '1.3' }),",
    "  Carousel: __previewStyled('div', { position: 'relative', display: 'block', overflow: 'hidden' }),",
    "  CarouselContent: __previewStyled('div', { display: 'flex', gap: '12px', overflowX: 'auto', padding: '4px 0' }),",
    "  CarouselItem: __previewStyled('div', { minWidth: '16rem', flex: '0 0 auto' }),",
    "  CarouselNext: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '9999px', border: '1px solid var(--border)', background: __s.card, color: __s.fg, cursor: 'pointer' }, { type: 'button' }),",
    "  CarouselPrevious: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '9999px', border: '1px solid var(--border)', background: __s.card, color: __s.fg, cursor: 'pointer' }, { type: 'button' }),",
    "  Checkbox: __previewStyled('input', { width: '16px', height: '16px', accentColor: __s.primary }, { type: 'checkbox' }),",
    "  ChartContainer: __previewSurface({ minHeight: '220px', padding: '12px' }),",
    "  ChartLegend: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: __s.mutedFg, marginTop: '8px' }),",
    "  ChartLegendContent: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: __s.mutedFg }),",
    "  ChartTooltip: ({ children, content }) => React.createElement(React.Fragment, null, content || children || null),",
    "  ChartTooltipContent: __previewSurface({ padding: '8px 10px', fontSize: '12px', minWidth: '8rem' }),",
    "  Command: __previewSurface({ padding: 0, overflow: 'hidden' }),",
    "  CommandDialog: __previewSurface({ maxWidth: '32rem', padding: 0, overflow: 'hidden' }),",
    "  CommandEmpty: __previewStyled('div', { padding: '16px', textAlign: 'center', color: __s.mutedFg, fontSize: '14px' }),",
    "  CommandGroup: __previewStyled('div', { padding: '4px' }),",
    "  CommandInput: __previewStyled('input', { width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', outline: 'none', fontSize: '14px', color: 'inherit' }),",
    "  CommandItem: __previewStyled('button', { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit', textAlign: 'left' }, { type: 'button' }),",
    "  CommandList: __previewStyled('div', { display: 'flex', flexDirection: 'column', padding: '4px' }),",
    "  ContextMenu: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  ContextMenuContent: __previewSurface({ minWidth: '12rem', padding: '4px' }),",
    "  ContextMenuItem: __previewStyled('button', { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit', textAlign: 'left' }, { type: 'button' }),",
    "  ContextMenuTrigger: __previewPrimitive('div'),",
    "  Dialog: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DialogContent: __previewSurface({ maxWidth: '32rem' }),",
    "  DialogDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  DialogFooter: __previewStyled('div', { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px' }),",
    "  DialogHeader: __previewStyled('div', { marginBottom: '8px' }),",
    "  DialogTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  DialogTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }, { type: 'button' }),",
    "  Drawer: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DrawerContent: __previewSurface({ padding: '16px', maxWidth: '32rem' }),",
    "  DrawerDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  DrawerFooter: __previewStyled('div', { display: 'flex', gap: '8px', padding: '16px' }),",
    "  DrawerHeader: __previewStyled('div', { padding: '16px' }),",
    "  DrawerTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  DrawerTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  DropdownMenu: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  DropdownMenuContent: __previewSurface({ minWidth: '12rem', padding: '4px' }),",
    "  DropdownMenuGroup: __previewPrimitive('div'),",
    "  DropdownMenuItem: __previewStyled('button', { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  DropdownMenuLabel: __previewStyled('div', { padding: '6px 8px', fontSize: '12px', fontWeight: 600, color: __s.mutedFg }),",
    "  DropdownMenuSeparator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }, { role: 'separator' }),",
    "  DropdownMenuTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Form: ({ children, ...props }) => React.createElement('form', props, children),",
    "  FormControl: ({ children }) => React.isValidElement(children) ? children : React.createElement(React.Fragment, null, children),",
    "  FormDescription: __previewStyled('p', { margin: '4px 0 0', color: __s.mutedFg, fontSize: '13px' }),",
    "  FormField: function(props) { return props?.render ? props.render({ field: { value: props?.defaultValue ?? '', onChange: function(){}, onBlur: function(){}, name: props?.name || '', ref: function(){} }, fieldState: { error: undefined }, formState: { errors: {} } }) : null; },",
    "  FormItem: __previewStyled('div', { display: 'grid', gap: '6px', marginBottom: '12px' }),",
    "  FormLabel: __previewStyled('label', { fontSize: '14px', fontWeight: 500, lineHeight: '1.5' }),",
    "  FormMessage: __previewStyled('p', { margin: 0, color: __s.destructive, fontSize: '12px' }),",
    "  HoverCard: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  HoverCardContent: __previewSurface({ minWidth: '16rem' }),",
    "  HoverCardTrigger: __previewPrimitive('button', { type: 'button' }),",
    "  Input: __previewStyled('input', { width: '100%', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', outline: 'none' }),",
    "  InputOTP: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '8px' }),",
    "  InputOTPGroup: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '8px' }),",
    "  InputOTPSeparator: __previewStyled('span', { color: __s.mutedFg, fontSize: '14px' }, { 'aria-hidden': 'true' }),",
    "  InputOTPSlot: __previewStyled('span', { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }),",
    "  Label: __previewStyled('label', { fontSize: '14px', fontWeight: 500, lineHeight: '1.5' }),",
    "  Calendar: function(props) { return React.createElement('div', { className: props?.className, style: { padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--foreground)', background: 'var(--card)' } }, '[Calendar]'); },",
    "  Menubar: __previewStyled('div', { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px', border: '1px solid var(--border)', borderRadius: __s.radius, background: __s.card }),",
    "  MenubarContent: __previewSurface({ minWidth: '14rem', padding: '4px' }),",
    "  MenubarItem: __previewStyled('button', { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit', textAlign: 'left' }, { type: 'button' }),",
    "  MenubarMenu: __previewPrimitive('div'),",
    "  MenubarSeparator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }, { role: 'separator' }),",
    "  MenubarTrigger: __previewStyled('button', { padding: '6px 10px', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  NavigationMenu: __previewStyled('nav', { display: 'flex', alignItems: 'center' }),",
    "  NavigationMenuContent: __previewSurface({ minWidth: '18rem' }),",
    "  NavigationMenuItem: __previewStyled('div', { display: 'inline-flex' }),",
    "  NavigationMenuLink: __previewStyled('a', { fontSize: '14px', fontWeight: 500, padding: '8px 12px', color: 'inherit', textDecoration: 'none' }),",
    "  NavigationMenuList: __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }),",
    "  NavigationMenuTrigger: __previewStyled('button', { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: 'none', border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Popover: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  PopoverContent: __previewSurface({ minWidth: '14rem' }),",
    "  PopoverTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Progress: __previewStyled('div', { height: '8px', width: '100%', borderRadius: '9999px', background: __s.muted, overflow: 'hidden' }),",
    "  RadioGroup: __previewStyled('div', { display: 'flex', flexDirection: 'column', gap: '8px' }),",
    "  RadioGroupItem: __previewStyled('input', { width: '16px', height: '16px', accentColor: __s.primary }, { type: 'radio' }),",
    "  ResizableHandle: function(props) { var direction = props?.orientation === 'vertical' ? 'vertical' : 'horizontal'; return React.createElement('div', { className: props?.className, style: direction === 'vertical' ? { height: '6px', borderRadius: '9999px', background: 'var(--border)', flexShrink: 0 } : { width: '6px', borderRadius: '9999px', background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' } }); },",
    "  ResizablePanel: __previewSurface({ flex: '1 1 0%', minWidth: 0, marginTop: 0 }),",
    "  ResizablePanelGroup: function(props) { var direction = props?.direction === 'vertical' ? 'column' : 'row'; return React.createElement('div', { className: props?.className, style: { display: 'flex', flexDirection: direction, gap: '8px', width: '100%' } }, props?.children); },",
    "  ScrollArea: __previewStyled('div', { overflow: 'auto' }),",
    "  ScrollBar: __previewPrimitive('div'),",
    "  Select: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  SelectContent: __previewSurface({ padding: '4px' }),",
    "  SelectItem: __previewStyled('div', { padding: '6px 32px 6px 8px', fontSize: '14px', cursor: 'pointer' }),",
    "  SelectTrigger: __previewStyled('button', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', cursor: 'pointer' }, { type: 'button' }),",
    "  SelectValue: __previewPrimitive('span'),",
    "  Separator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '0', width: '100%' }, { role: 'separator' }),",
    "  Sheet: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  SheetContent: __previewSurface({ padding: '16px', maxWidth: '28rem' }),",
    "  SheetDescription: __previewStyled('p', { fontSize: '14px', color: __s.mutedFg }),",
    "  SheetHeader: __previewStyled('div', { marginBottom: '8px' }),",
    "  SheetTitle: __previewStyled('div', { fontSize: '18px', fontWeight: 600 }),",
    "  SheetTrigger: __previewStyled('button', { background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }, { type: 'button' }),",
    "  Skeleton: __previewStyled('div', { borderRadius: __s.radius, background: __s.muted, animation: 'pulse 2s ease-in-out infinite' }),",
    "  Slider: function(props) { var raw = Array.isArray(props?.value) ? props.value[0] : props?.value; var min = typeof props?.min === 'number' ? props.min : 0; var max = typeof props?.max === 'number' ? props.max : 100; var value = typeof raw === 'number' ? raw : Math.round((min + max) / 2); var percent = Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100)); return React.createElement('div', { style: { position: 'relative', width: '100%', height: '20px', display: 'flex', alignItems: 'center' } }, React.createElement('div', { style: { width: '100%', height: '6px', borderRadius: '9999px', background: 'var(--muted)' } }, React.createElement('div', { style: { width: percent + '%', height: '6px', borderRadius: '9999px', background: 'var(--primary)' } })), React.createElement('div', { style: { position: 'absolute', left: 'calc(' + percent + '% - 8px)', width: '16px', height: '16px', borderRadius: '9999px', background: 'var(--background)', border: '2px solid var(--primary)' } })); },",
    "  Sonner: () => null,",
    "  Sidebar: Sidebar,",
    "  SidebarContent: __previewStyled('div', { display: 'flex', minHeight: 0, flex: '1 1 0%', flexDirection: 'column', gap: '8px', overflow: 'auto' }),",
    "  SidebarFooter: __previewStyled('div', { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }),",
    "  SidebarGroup: __previewStyled('section', { display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' }),",
    "  SidebarGroupAction: SidebarGroupAction,",
    "  SidebarGroupContent: __previewStyled('div', { display: 'flex', flexDirection: 'column', gap: '4px' }),",
    "  SidebarGroupLabel: SidebarGroupLabel,",
    "  SidebarHeader: __previewStyled('div', { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }),",
    "  SidebarInput: __previewStyled('input', { height: '32px', width: '100%', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, padding: '0 10px', fontSize: '14px', outline: 'none' }),",
    "  SidebarInset: __previewStyled('main', { flex: '1 1 0%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px', background: __s.bg, color: __s.fg, borderRadius: __s.radius, padding: '8px' }),",
    "  SidebarMenu: __previewStyled('ul', { display: 'flex', flexDirection: 'column', gap: '4px', listStyle: 'none', margin: 0, padding: 0 }),",
    "  SidebarMenuAction: SidebarMenuAction,",
    "  SidebarMenuBadge: SidebarMenuBadge,",
    "  SidebarMenuButton: SidebarMenuButton,",
    "  SidebarMenuItem: __previewStyled('li', { position: 'relative' }),",
    "  SidebarMenuSkeleton: SidebarMenuSkeleton,",
    "  SidebarMenuSub: SidebarMenuSub,",
    "  SidebarMenuSubButton: SidebarMenuSubButton,",
    "  SidebarMenuSubItem: __previewStyled('li', { position: 'relative' }),",
    "  SidebarProvider: SidebarProvider,",
    "  SidebarRail: SidebarRail,",
    "  SidebarSeparator: __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }, { role: 'separator' }),",
    "  SidebarTrigger: SidebarTrigger,",
    "  Switch: __previewStyled('button', { width: '44px', height: '24px', borderRadius: '9999px', background: __s.muted, border: 'none', cursor: 'pointer', position: 'relative' }, { type: 'button', role: 'switch' }),",
    "  Table: __previewStyled('table', { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }),",
    "  TableBody: __previewPrimitive('tbody'),",
    "  TableCaption: __previewStyled('caption', { color: __s.mutedFg, fontSize: '14px', padding: '8px 0' }),",
    "  TableCell: __previewStyled('td', { padding: '12px 16px', borderBottom: '1px solid var(--border)' }),",
    "  TableFooter: __previewStyled('tfoot', { fontWeight: 500, background: __s.muted }),",
    "  TableHead: __previewStyled('th', { padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: __s.mutedFg, borderBottom: '1px solid var(--border)' }),",
    "  TableHeader: __previewPrimitive('thead'),",
    "  TableRow: __previewStyled('tr', { borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }),",
    "  Tabs: ({ children, defaultValue }) => { const [tab, setTab] = React.useState(defaultValue || ''); return React.createElement('__TabsCtx', null, React.Children.map(children, c => React.isValidElement(c) ? React.cloneElement(c, { __activeTab: tab, __setTab: setTab }) : c)); },",
    "  TabsContent: React.forwardRef(function TabsContent(props, ref) { const { value, __activeTab, children, ...rest } = props || {}; if (__activeTab && value && __activeTab !== value) return null; return React.createElement('div', { ...rest, ref }, children); }),",
    "  TabsList: __previewStyled('div', { display: 'inline-flex', gap: '2px', padding: '4px', borderRadius: __s.radius, background: __s.muted }),",
    "  TabsTrigger: React.forwardRef(function TabsTrigger(props, ref) { const { value, __activeTab, __setTab, children, ...rest } = props || {}; const active = __activeTab === value; return React.createElement('button', { ...rest, ref, type: 'button', onClick: () => __setTab && __setTab(value), style: { padding: '6px 12px', borderRadius: 'calc(var(--radius,0.5rem) - 2px)', border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', background: active ? __s.bg : 'transparent', color: active ? __s.fg : __s.mutedFg, boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', ...(rest.style||{}) } }, children); }),",
    "  Textarea: __previewStyled('textarea', { width: '100%', minHeight: '80px', padding: '8px 12px', borderRadius: __s.radius, border: '1px solid var(--border)', background: __s.bg, color: __s.fg, fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }),",
    "  Tooltip: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  TooltipContent: __previewSurface({ padding: '8px 10px', fontSize: '12px' }),",
    "  TooltipProvider: ({ children }) => React.createElement(React.Fragment, null, children),",
    "  TooltipTrigger: __previewPrimitive('button', { type: 'button' }),",
    "  useSidebar: useSidebar,",
    "};",
    "function __previewGetUiComponent(name) {",
    "  return __previewUiMap[name] || __previewPrimitive('div');",
    "}",
    "function __previewGetIcon(name) {",
    "  return React.forwardRef(function PreviewIcon(props, ref) {",
    "    const s = props?.className?.includes('w-') ? {} : { width: '1em', height: '1em' };",
    "    return React.createElement('svg', { ...props, ref, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'data-preview-icon': name, style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...s, ...(props?.style||{}) } },",
    "      React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, opacity: 0.15 }),",
    "    );",
    "  });",
    "}",
    "var motion = new Proxy({}, {",
    "  get: function(_, tag) {",
    "    if (typeof tag !== 'string') return undefined;",
    "    return React.forwardRef(function MotionShim(props, ref) {",
    "      var { initial, animate, exit, transition, whileHover, whileInView, whileTap, whileFocus, whileDrag, variants, drag, dragConstraints, layout, layoutId, onAnimationComplete, onAnimationStart, onDrag, onDragEnd, onDragStart, viewport, ...rest } = props || {};",
    "      return React.createElement(tag, { ...rest, ref });",
    "    });",
    "  }",
    "});",
    "var AnimatePresence = function AnimatePresence(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var useMotionValue = function() { return { get: function() { return 0; }, set: function() {}, on: function() { return function(){}; } }; };",
    "var useTransform = function() { return { get: function() { return 0; } }; };",
    "var useSpring = function(v) { return v || { get: function() { return 0; } }; };",
    "var useScroll = function() { return { scrollY: { get: function() { return 0; } }, scrollYProgress: { get: function() { return 0; } }, scrollX: { get: function() { return 0; } }, scrollXProgress: { get: function() { return 0; } } }; };",
    "var useInView = function() { return false; };",
    "var useAnimation = function() { return { start: function() { return Promise.resolve(); }, stop: function() {}, set: function() {} }; };",

    "var __chartShim = React.forwardRef(function ChartShim(props, ref) {",
    "  var { children, data, width, height, className, style, ...rest } = props || {};",
    "  var w = width || '100%'; var h = height || 300;",
    "  return React.createElement('div', { ref, className, style: { width: typeof w === 'number' ? w + 'px' : w, height: typeof h === 'number' ? h + 'px' : h, background: 'var(--muted, #1e293b)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground, #94a3b8)', fontSize: '14px', ...style } },",
    "    children || '[Chart]'",
    "  );",
    "});",
    "var __chartChildShim = function(props) { return null; };",
    "var AreaChart = __chartShim; var BarChart = __chartShim; var LineChart = __chartShim;",
    "var PieChart = __chartShim; var RadarChart = __chartShim; var RadialBarChart = __chartShim;",
    "var ComposedChart = __chartShim; var ScatterChart = __chartShim; var Treemap = __chartShim;",
    "var ResponsiveContainer = function(props) { return React.createElement('div', { style: { width: '100%', height: props?.height || 300 } }, props?.children); };",
    "var Area = __chartChildShim; var Bar = __chartChildShim; var Line = __chartChildShim;",
    "var Pie = __chartChildShim; var Cell = __chartChildShim; var Scatter = __chartChildShim;",
    "var XAxis = __chartChildShim; var YAxis = __chartChildShim; var ZAxis = __chartChildShim;",
    "var CartesianGrid = __chartChildShim; var Tooltip = function(p){ return null; };",
    "var Legend = __chartChildShim; var Brush = __chartChildShim; var ReferenceLine = __chartChildShim;",
    "var ReferenceArea = __chartChildShim; var Radar = __chartChildShim; var PolarGrid = __chartChildShim;",
    "var PolarAngleAxis = __chartChildShim; var PolarRadiusAxis = __chartChildShim;",
    "var RadialBar = __chartChildShim; var Funnel = __chartChildShim; var FunnelChart = __chartShim;",

    "var Canvas = function(props) { return React.createElement('div', { style: { width: '100%', height: '400px', background: '#0a0a0a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '14px' } }, '[3D Canvas]'); };",
    "var useFrame = function() {};",
    "var useThree = function() { return { gl: {}, scene: {}, camera: {}, size: { width: 800, height: 600 }, viewport: { width: 8, height: 6 } }; };",
    "var useLoader = function() { return {}; };",
    "var Html = function(props) { return React.createElement('div', null, props?.children); };",
    "var OrbitControls = function() { return null; };",
    "var PerspectiveCamera = function() { return null; };",
    "var Environment = function() { return null; };",
    "var Stars = function() { return null; };",
    "var Float = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var Text3D = function(props) { return React.createElement('span', null, props?.children || ''); };",
    "var Center = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var useGLTF = function() { return { scene: {}, nodes: {}, materials: {} }; };",
    "var MeshDistortMaterial = function() { return null; };",
    "var Sphere = function() { return null; };",
    "var Box = function() { return null; };",

    "var toast = function() {};",
    "toast.success = function() {}; toast.error = function() {}; toast.info = function() {};",
    "toast.warning = function() {}; toast.loading = function() {}; toast.dismiss = function() {};",
    "toast.promise = function(p) { return p; }; toast.custom = function() {};",
    "var useToast = function() { return { toast: toast, dismiss: function(){}, toasts: [] }; };",
    "var useIsMobile = function() { return false; };",

    "var useEmblaCarousel = function() { return [function(node){}, { canScrollPrev: function(){return false}, canScrollNext: function(){return false}, scrollPrev: function(){}, scrollNext: function(){}, on: function(){return function(){}}, off: function(){} }]; };",

    "var useForm = function(opts) { return { register: function(n){return{name:n,onChange:function(){},onBlur:function(){},ref:function(){}}}, handleSubmit: function(fn){return function(e){e&&e.preventDefault&&e.preventDefault();fn({})}}, formState: {errors:{},isSubmitting:false,isValid:true,isDirty:false}, watch: function(){return undefined}, setValue: function(){}, getValues: function(){return {}}, reset: function(){}, control: {}, trigger: function(){return Promise.resolve(true)} }; };",
    "var FormProvider = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var useFormContext = function() { return useForm(); };",
    "var Controller = function(props) { return props?.render ? props.render({ field: { value: '', onChange: function(){}, onBlur: function(){}, name: props.name || '', ref: function(){} }, fieldState: { error: undefined }, formState: { errors: {} } }) : null; };",
    "var zodResolver = function() { return function() { return { values: {}, errors: {} }; }; };",
    "var z = { string: function(){return z}, number: function(){return z}, boolean: function(){return z}, object: function(){return z}, array: function(){return z}, enum: function(){return z}, optional: function(){return z}, min: function(){return z}, max: function(){return z}, email: function(){return z}, url: function(){return z}, regex: function(){return z}, refine: function(){return z}, transform: function(){return z}, default: function(){return z}, nullable: function(){return z}, union: function(){return z}, intersection: function(){return z}, literal: function(){return z}, coerce: { string: function(){return z}, number: function(){return z} }, infer: undefined, parse: function(v){return v}, safeParse: function(v){return {success:true,data:v}} };",

    "var format = function(d, f) { try { return new Date(d).toLocaleDateString(); } catch { return String(d); } };",
    "var formatDistance = function() { return ''; };",
    "var formatRelative = function() { return ''; };",
    "var parseISO = function(s) { return new Date(s); };",
    "var isValid = function(d) { return d instanceof Date && !isNaN(d.getTime()); };",
    "var addDays = function(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; };",
    "var subDays = function(d, n) { return addDays(d, -n); };",
    "var isBefore = function(a, b) { return new Date(a) < new Date(b); };",
    "var isAfter = function(a, b) { return new Date(a) > new Date(b); };",
    "var startOfMonth = function(d) { var r = new Date(d); r.setDate(1); return r; };",
    "var endOfMonth = function(d) { var r = new Date(d); r.setMonth(r.getMonth() + 1, 0); return r; };",

    "var Command = __previewPrimitive('div');",
    "var CommandDialog = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var CommandEmpty = __previewStyled('div', { padding: '24px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' });",
    "var CommandGroup = __previewPrimitive('div');",
    "var CommandInput = __previewStyled('input', { width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: 'inherit' });",
    "var CommandItem = __previewStyled('div', { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '14px' });",
    "var CommandList = __previewPrimitive('div');",
    "var CommandSeparator = __previewStyled('hr', { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' });",

    "var Drawer = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var DrawerPortal = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var DrawerOverlay = function() { return null; };",

    "var create = function(fn) { var state = typeof fn === 'function' ? fn(function(){}, function(){return state}, { getState: function(){return state} }) : fn; return function(selector) { return selector ? selector(state) : state; }; };",

    "var useSWR = function(key, fetcher) { return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: function(){} }; };",

    "var ThemeProvider = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var useTheme = function() { return { theme: 'dark', setTheme: function(){}, resolvedTheme: 'dark', themes: ['light','dark'], systemTheme: 'dark' }; };",

    "var DayPicker = function(props) { return React.createElement('div', { style: { padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--foreground)' } }, '[Calendar]'); };",

    "var OTPInput = __previewStyled('input', { width: '40px', height: '40px', textAlign: 'center', fontSize: '18px', border: '1px solid var(--border)', borderRadius: 'var(--radius, 0.5rem)', background: 'var(--background)', color: 'var(--foreground)' });",
    "var REGEXP_ONLY_DIGITS = /^\\d+$/;",
    "var REGEXP_ONLY_DIGITS_AND_CHARS = /^[a-zA-Z0-9]+$/;",

    "var Panel = __previewStyled('div', { overflow: 'auto', height: '100%' });",
    "var PanelGroup = __previewStyled('div', { display: 'flex', height: '100%', width: '100%' });",
    "var PanelResizeHandle = __previewStyled('div', { width: '4px', background: 'var(--border)', cursor: 'col-resize', flexShrink: 0 });",

    "var cva = function(base) { return function(props) { return base || ''; }; };",

    "var flexRender = function(comp, props) { if (typeof comp === 'function') return comp(props); return comp; };",
    "var getCoreRowModel = function() { return function() { return { rows: [] }; }; };",
    "var useReactTable = function(opts) { return { getHeaderGroups: function(){return []}, getRowModel: function(){return {rows: []}}, getCanPreviousPage: function(){return false}, getCanNextPage: function(){return false}, previousPage: function(){}, nextPage: function(){}, getState: function(){return {sorting:[],columnFilters:[],pagination:{pageIndex:0,pageSize:10}}}, setSorting: function(){}, setColumnFilters: function(){}, setGlobalFilter: function(){} }; };",
    "var getSortedRowModel = function() { return function() { return { rows: [] }; }; };",
    "var getFilteredRowModel = function() { return function() { return { rows: [] }; }; };",
    "var getPaginationRowModel = function() { return function() { return { rows: [] }; }; };",

    "var QueryClient = function() { return {}; };",
    "var QueryClientProvider = function(props) { return React.createElement(React.Fragment, null, props?.children); };",
    "var useQuery = function() { return { data: undefined, error: null, isLoading: false, isError: false, refetch: function(){} }; };",
    "var useMutation = function() { return { mutate: function(){}, mutateAsync: function(){return Promise.resolve()}, isLoading: false, isError: false, error: null }; };",
  ];

  const emitted = new Set<string>();
  const GLOBAL_STUBS = new Set(["Image", "Link", "useRouter", "usePathname", "useSearchParams"]);

  const emit = (line: string) => {
    if (emitted.has(line)) return;
    emitted.add(line);
    lines.push(line);
  };

  const emitBinding = (name: string, value: string) => {
    if (GLOBAL_STUBS.has(name)) return;
    emit(`var ${name} = ${value};`);
  };

  for (const preparedModule of modules) {
    for (const imp of preparedModule.imports) {
      if (imp.source === "react") {
        if (imp.defaultImport && imp.defaultImport !== "React") {
          emitBinding(imp.defaultImport, "React");
        }
        if (imp.namespaceImport && imp.namespaceImport !== "React") {
          emitBinding(imp.namespaceImport, "React");
        }
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `React.${binding.imported}`);
        }
        continue;
      }

      if (imp.source === "next/image") {
        if (imp.defaultImport && imp.defaultImport !== "Image") {
          emitBinding(imp.defaultImport, "Image");
        }
        continue;
      }

      if (imp.source === "next/link") {
        if (imp.defaultImport && imp.defaultImport !== "Link") {
          emitBinding(imp.defaultImport, "Link");
        }
        continue;
      }

      if (imp.source === "next/navigation") {
        for (const binding of imp.namedImports) {
          if (
            binding.imported === "useRouter" ||
            binding.imported === "usePathname" ||
            binding.imported === "useSearchParams"
          ) {
            emitBinding(binding.local, binding.imported);
          } else {
            emitBinding(binding.local, "() => undefined");
          }
        }
        continue;
      }

      if (imp.source === "lucide-react") {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `__previewGetIcon(${JSON.stringify(binding.imported)})`);
        }
        continue;
      }

      if (imp.source === "framer-motion" || imp.source === "motion/react") {
        if (imp.defaultImport) {
          emitBinding(imp.defaultImport, "motion");
        }
        if (imp.namespaceImport) {
          emitBinding(imp.namespaceImport, "{ motion, AnimatePresence, useMotionValue, useTransform, useSpring, useScroll, useInView, useAnimation }");
        }
        for (const binding of imp.namedImports) {
          const knownShims: Record<string, string> = {
            motion: "motion",
            AnimatePresence: "AnimatePresence",
            useMotionValue: "useMotionValue",
            useTransform: "useTransform",
            useSpring: "useSpring",
            useScroll: "useScroll",
            useInView: "useInView",
            useAnimation: "useAnimation",
          };
          const shimValue = knownShims[binding.imported];
          if (shimValue) {
            emitBinding(binding.local, shimValue);
          } else {
            emitBinding(binding.local, "() => undefined");
          }
        }
        continue;
      }

      if (imp.source === "recharts") {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported);
        }
        if (imp.defaultImport) emitBinding(imp.defaultImport, "{}");
        continue;
      }

      if (imp.source === "three" || imp.source === "@react-three/fiber" || imp.source === "@react-three/drei") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "{}");
        if (imp.namespaceImport) emitBinding(imp.namespaceImport, "{}");
        for (const binding of imp.namedImports) {
          const knownR3f: Record<string, string> = {
            Canvas: "Canvas", useFrame: "useFrame", useThree: "useThree", useLoader: "useLoader",
            Html: "Html", OrbitControls: "OrbitControls", PerspectiveCamera: "PerspectiveCamera",
            Environment: "Environment", Stars: "Stars", Float: "Float", Text3D: "Text3D",
            Center: "Center", useGLTF: "useGLTF", MeshDistortMaterial: "MeshDistortMaterial",
            Sphere: "Sphere", Box: "Box",
          };
          const shimValue = knownR3f[binding.imported];
          emitBinding(binding.local, shimValue || "function() { return null; }");
        }
        continue;
      }

      if (imp.source === "sonner") {
        for (const binding of imp.namedImports) {
          if (binding.imported === "toast") emitBinding(binding.local, "toast");
          else if (binding.imported === "Toaster") emitBinding(binding.local, "function() { return null; }");
          else emitBinding(binding.local, "function() {}");
        }
        continue;
      }

      if (imp.source === "embla-carousel-react") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "useEmblaCarousel");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "default" ? "useEmblaCarousel" : "useEmblaCarousel");
        }
        continue;
      }

      if (imp.source === "react-hook-form") {
        for (const binding of imp.namedImports) {
          const knownRhf: Record<string, string> = {
            useForm: "useForm", FormProvider: "FormProvider",
            useFormContext: "useFormContext", Controller: "Controller",
          };
          emitBinding(binding.local, knownRhf[binding.imported] || "function() {}");
        }
        continue;
      }

      if (imp.source === "zod") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "z");
        if (imp.namespaceImport) emitBinding(imp.namespaceImport, "z");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "z" ? "z" : "z");
        }
        continue;
      }

      if (imp.source === "@hookform/resolvers" || imp.source === "@hookform/resolvers/zod") {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "zodResolver" ? "zodResolver" : "function() { return function() { return { values: {}, errors: {} }; }; }");
        }
        continue;
      }

      if (imp.source === "date-fns" || imp.source.startsWith("date-fns/")) {
        const knownDateFns: Record<string, string> = {
          format: "format", formatDistance: "formatDistance", formatRelative: "formatRelative",
          parseISO: "parseISO", isValid: "isValid", addDays: "addDays", subDays: "subDays",
          isBefore: "isBefore", isAfter: "isAfter", startOfMonth: "startOfMonth", endOfMonth: "endOfMonth",
        };
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, knownDateFns[binding.imported] || "function() { return ''; }");
        }
        if (imp.defaultImport) emitBinding(imp.defaultImport, "format");
        continue;
      }

      if (imp.source === "cmdk") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "Command");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported);
        }
        continue;
      }

      if (imp.source === "vaul") {
        for (const binding of imp.namedImports) {
          const knownVaul: Record<string, string> = { Drawer: "Drawer", DrawerPortal: "DrawerPortal", DrawerOverlay: "DrawerOverlay" };
          emitBinding(binding.local, knownVaul[binding.imported] || "__previewPrimitive('div')");
        }
        continue;
      }

      if (imp.source === "zustand") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "create");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "create" ? "create" : "function() {}");
        }
        continue;
      }

      if (imp.source === "swr") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "useSWR");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "default" ? "useSWR" : "useSWR");
        }
        continue;
      }

      if (imp.source === "next-themes") {
        for (const binding of imp.namedImports) {
          const knownNT: Record<string, string> = { ThemeProvider: "ThemeProvider", useTheme: "useTheme" };
          emitBinding(binding.local, knownNT[binding.imported] || "function() {}");
        }
        continue;
      }

      if (imp.source === "react-day-picker") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "DayPicker");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "DayPicker" ? "DayPicker" : "function() { return null; }");
        }
        continue;
      }

      if (imp.source === "input-otp") {
        for (const binding of imp.namedImports) {
          const knownOtp: Record<string, string> = {
            OTPInput: "OTPInput", REGEXP_ONLY_DIGITS: "REGEXP_ONLY_DIGITS",
            REGEXP_ONLY_DIGITS_AND_CHARS: "REGEXP_ONLY_DIGITS_AND_CHARS",
          };
          emitBinding(binding.local, knownOtp[binding.imported] || "__previewPrimitive('input')");
        }
        continue;
      }

      if (imp.source === "react-resizable-panels") {
        const knownPanels: Record<string, string> = {
          Panel: "Panel", PanelGroup: "PanelGroup", PanelResizeHandle: "PanelResizeHandle",
        };
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, knownPanels[binding.imported] || "__previewPrimitive('div')");
        }
        continue;
      }

      if (imp.source === "class-variance-authority") {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, binding.imported === "cva" ? "cva" : "function() { return ''; }");
        }
        continue;
      }

      if (imp.source === "clsx" || imp.source === "tailwind-merge") {
        if (imp.defaultImport) emitBinding(imp.defaultImport, "__previewCn");
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, "__previewCn");
        }
        continue;
      }

      if (imp.source === "@tanstack/react-table") {
        const knownTable: Record<string, string> = {
          flexRender: "flexRender", getCoreRowModel: "getCoreRowModel",
          useReactTable: "useReactTable", getSortedRowModel: "getSortedRowModel",
          getFilteredRowModel: "getFilteredRowModel", getPaginationRowModel: "getPaginationRowModel",
        };
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, knownTable[binding.imported] || "function() {}");
        }
        continue;
      }

      if (imp.source === "@tanstack/react-query") {
        const knownRQ: Record<string, string> = {
          QueryClient: "QueryClient", QueryClientProvider: "QueryClientProvider",
          useQuery: "useQuery", useMutation: "useMutation",
        };
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, knownRQ[binding.imported] || "function() {}");
        }
        continue;
      }

      if (imp.source.startsWith("@radix-ui/")) {
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, "__previewPrimitive('div')");
        }
        if (imp.defaultImport) emitBinding(imp.defaultImport, "__previewPrimitive('div')");
        if (imp.namespaceImport) emitBinding(imp.namespaceImport, "new Proxy({}, { get: () => __previewPrimitive('div') })");
        continue;
      }

      if (imp.source.startsWith("@/components/ui/")) {
        if (imp.defaultImport) {
          emitBinding(
            imp.defaultImport,
            `__previewGetUiComponent(${JSON.stringify(inferPreviewUiComponentName(imp.source))})`,
          );
        }
        if (imp.namespaceImport) {
          emitBinding(
            imp.namespaceImport,
            "new Proxy({}, { get: (_, key) => __previewGetUiComponent(String(key)) })",
          );
        }
        for (const binding of imp.namedImports) {
          emitBinding(binding.local, `__previewGetUiComponent(${JSON.stringify(binding.imported)})`);
        }
        continue;
      }

      if (imp.source === "@/lib/utils") {
        if (imp.defaultImport) {
          emitBinding(imp.defaultImport, "__previewCn");
        }
        if (imp.namespaceImport) {
          emitBinding(
            imp.namespaceImport,
            "new Proxy({}, { get: (_, key) => key === 'cn' ? __previewCn : ((...args) => args[0]) })",
          );
        }
        for (const binding of imp.namedImports) {
          if (binding.imported === "cn") {
            emitBinding(binding.local, "__previewCn");
          } else {
            emitBinding(binding.local, "(...args) => args[0]");
          }
        }
        continue;
      }

      if (imp.source === "@/hooks/use-mobile") {
        if (imp.defaultImport) {
          emitBinding(imp.defaultImport, "useIsMobile");
        }
        if (imp.namespaceImport) {
          emitBinding(imp.namespaceImport, "{ useIsMobile }");
        }
        for (const binding of imp.namedImports) {
          emitBinding(
            binding.local,
            binding.imported === "useIsMobile" ? "useIsMobile" : "() => false",
          );
        }
        continue;
      }

      if (imp.source === "@/hooks/use-toast") {
        if (imp.defaultImport) {
          emitBinding(imp.defaultImport, "useToast");
        }
        if (imp.namespaceImport) {
          emitBinding(imp.namespaceImport, "{ useToast, toast }");
        }
        for (const binding of imp.namedImports) {
          if (binding.imported === "useToast") emitBinding(binding.local, "useToast");
          else if (binding.imported === "toast") emitBinding(binding.local, "toast");
          else if (binding.imported === "Toaster") emitBinding(binding.local, "function() { return null; }");
          else emitBinding(binding.local, "function() {}");
        }
        continue;
      }
    }
  }

  return lines.join("\n");
}
