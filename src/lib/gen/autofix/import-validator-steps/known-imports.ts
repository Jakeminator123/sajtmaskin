export const KNOWN_MODULE_SPECIFIERS: Record<string, string[]> = {
  react: [
    "useState", "useEffect", "useRef", "useCallback", "useMemo",
    "useContext", "useReducer", "useId", "useLayoutEffect",
    "createContext", "forwardRef", "memo", "lazy", "Suspense",
    "Fragment", "StrictMode", "Children", "cloneElement",
    "createElement", "isValidElement",
  ],
  "framer-motion": [
    "motion", "AnimatePresence", "useAnimation", "useInView",
    "useScroll", "useTransform", "useMotionValue", "useSpring",
    "useMotionValueEvent", "LayoutGroup", "Reorder",
  ],
  "next/image": ["Image"],
  "next/link": ["Link"],
  "next/navigation": [
    "useRouter", "usePathname", "useSearchParams", "useParams",
    "redirect", "notFound",
  ],
  "next/font/google": [
    "Inter", "Geist", "Geist_Mono", "Roboto", "Open_Sans", "Lato",
    "Montserrat", "Poppins", "Raleway", "Nunito", "Space_Grotesk",
    "DM_Sans", "DM_Mono", "Playfair_Display",
  ],
  "react-error-boundary": ["ErrorBoundary", "useErrorBoundary", "withErrorBoundary"],
  "react-intersection-observer": ["InView"],
  "@tanstack/react-virtual": ["useVirtualizer", "useWindowVirtualizer"],
  "@tanstack/react-query": [
    "QueryClient", "QueryClientProvider", "useQuery", "useMutation",
    "useInfiniteQuery", "useQueryClient", "useSuspenseQuery",
  ],
  "@/lib/utils": ["cn"],
};

export const LUCIDE_TYPE_ONLY_IMPORTS = [
  "IconNode",
  "LucideIcon",
  "LucideProps",
  "SVGAttributes",
] as const;

export const NEXT_AUTO_IMPORTS: Record<string, string> = {
  Link: 'import Link from "next/link"',
  Image: 'import Image from "next/image"',
  Metadata: 'import type { Metadata } from "next"',
};

export const REACT_HOOKS: Record<string, true> = {
  useState: true,
  useEffect: true,
  useRef: true,
  useCallback: true,
  useMemo: true,
  useContext: true,
  useReducer: true,
  useId: true,
  useTransition: true,
  useDeferredValue: true,
  useImperativeHandle: true,
  useLayoutEffect: true,
  useSyncExternalStore: true,
  useInsertionEffect: true,
};
