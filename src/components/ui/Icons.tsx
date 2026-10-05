import type { SVGProps } from 'react';

/**
 * Small, consistent stroke-icon set used across the app (top nav, page
 * headers, buttons). Deliberately minimal — one weight, one style — rather
 * than pulling in an icon library, so the bundle stays lean and every icon
 * shares the same visual DNA.
 */
type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function IconFactory(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 21V10.5l5.5 4V10.5l5.5 4V10.5l6-4.2V21H3Z" />
      <path d="M7 21v-4h4v4M14 21v-3h3v3" />
      <path d="M6 4.5h2v3H6z" />
    </svg>
  );
}

export function IconWarehouse(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function IconStorefront(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 9.5 5.2 4h13.6L20 9.5" />
      <path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5 10v9.5a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 5 6v6c0 5 3 8.2 7 9 4-.8 7-4 7-9V6l-7-2.5Z" />
      <path d="m9.25 12.25 1.9 1.9 3.6-3.9" />
    </svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15V9M12 15l3.2-2.6" />
      <path d="M4 19h16" />
    </svg>
  );
}

export function IconBoxes(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8.2 9 5.5l5 2.7v5.6l-5 2.7-5-2.7V8.2Z" />
      <path d="M9 5.5 14 8.2v5.6M9 11.1l5-2.9" />
      <path d="M14 15.5l4.5-2.4 4 2.2v5.1l-4 2.2-4.5-2.4" />
      <path d="M18.5 13.1v5.2" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 20c.5-3.6 3-5.8 6.2-5.8s5.7 2.2 6.2 5.8" />
      <path d="M15.3 6a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17.5 14.4c2.6.5 4.3 2.3 4.7 5.6" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

export function IconPrinter(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 9V4h10v5" />
      <path d="M7 18H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
      <path d="M7 14h10v6H7z" />
    </svg>
  );
}

export function IconQrCode(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h3v3h-3zM20.5 14.5v3M17.5 20.5h3" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5 21 19H3L12 4.5Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S5.8 5.5 12 5.5 21.5 12 21.5 12 18.2 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6.2 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3.2 3.9M6.6 6.9C4 8.7 2.5 12 2.5 12S5.8 18.5 12 18.5a9.6 9.6 0 0 0 3.4-.6" />
      <path d="M9.5 9.6a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconTruck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7h10v9H3z" />
      <path d="M13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </svg>
  );
}

export function IconClipboardList(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="4.5" width="14" height="16" rx="1.5" />
      <path d="M9 3.5h6v2H9z" />
      <path d="M8.5 10.5h7M8.5 13.5h7M8.5 16.5h4" />
    </svg>
  );
}

export function IconPackage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8L12 3.5Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5V20.5" />
    </svg>
  );
}

export function IconChip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

/** Paint-drop mark used in the brand lockup. */
export function IconDroplet(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5c3 4 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 3-7 6-11Z" />
    </svg>
  );
}
