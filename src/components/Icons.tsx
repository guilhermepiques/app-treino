import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const Svg = ({ size = 22, children, ...rest }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
)

export const IconFicha = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
    <path d="M9 3.5h6v3H9z" />
    <path d="M8.5 11h7M8.5 15h5" />
  </Svg>
)

export const IconDumbbell = (p: P) => (
  <Svg {...p}>
    <path d="M7 12h10" />
    <rect x="4" y="7.5" width="3" height="9" rx="1" />
    <rect x="17" y="7.5" width="3" height="9" rx="1" />
    <path d="M2.5 10v4M21.5 10v4" />
  </Svg>
)

export const IconHistory = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4v4h4" />
    <path d="M12 8v4.5l3 2" />
  </Svg>
)

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconMinus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const IconDots = (p: P) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const IconUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V6M6 11.5L12 5.5l6 6" />
  </Svg>
)

export const IconDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v13M6 12.5l6 6 6-6" />
  </Svg>
)

export const IconEqual = (p: P) => (
  <Svg {...p}>
    <path d="M6 9.5h12M6 14.5h12" />
  </Svg>
)

export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5a2.5 2.5 0 0 0 3 3.5M16 6h3a2.5 2.5 0 0 1-3 3.5" />
    <path d="M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" />
  </Svg>
)

export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Svg>
)

export const IconDrop = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l6 6 6-6" />
    <path d="M6 12l6 6 6-6" />
  </Svg>
)

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
)

export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 19.5h16" />
    <path d="M5 15.5l4.5-5 3.5 3 6-7" />
    <path d="M15 6.5h4v4" />
  </Svg>
)
