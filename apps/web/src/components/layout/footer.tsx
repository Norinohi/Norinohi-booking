/*
 * Footer — Figma "Footer" (nodes 985:73146 desktop / 985:73145 tablet / 985:73144 mobile).
 * Dark section (#0a0a0a): 28px wordmark, 20px tagline + description, three 20px column
 * headings over 16px links, and a 14px uppercase legal bar. Three exact variants:
 *   2xl (1536+) — brand left, columns right (justify-between), left-aligned.
 *   md–2xl (tablet) — everything centred, columns in a row.
 *   base (mobile) — everything centred, columns stacked.
 */

// Filled brand marks exported from Figma (footer node 985:73015). Inherit `currentColor`.
function InstagramIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 0C8.74 0 8.333 0.015 7.053 0.072C5.775 0.132 4.905 0.333 4.14 0.63C3.351 0.936 2.681 1.347 2.014 2.014C1.347 2.681 0.935 3.35 0.63 4.14C0.333 4.905 0.131 5.775 0.072 7.053C0.012 8.333 0 8.74 0 12C0 15.26 0.015 15.667 0.072 16.947C0.132 18.224 0.333 19.095 0.63 19.86C0.936 20.648 1.347 21.319 2.014 21.986C2.681 22.652 3.35 23.065 4.14 23.37C4.906 23.666 5.776 23.869 7.053 23.928C8.333 23.988 8.74 24 12 24C15.26 24 15.667 23.985 16.947 23.928C18.224 23.868 19.095 23.666 19.86 23.37C20.648 23.064 21.319 22.652 21.986 21.986C22.652 21.319 23.065 20.651 23.37 19.86C23.666 19.095 23.869 18.224 23.928 16.947C23.988 15.667 24 15.26 24 12C24 8.74 23.985 8.333 23.928 7.053C23.868 5.776 23.666 4.904 23.37 4.14C23.064 3.351 22.652 2.681 21.986 2.014C21.319 1.347 20.651 0.935 19.86 0.63C19.095 0.333 18.224 0.131 16.947 0.072C15.667 0.012 15.26 0 12 0ZM12 2.16C15.203 2.16 15.585 2.176 16.85 2.231C18.02 2.286 18.655 2.48 19.077 2.646C19.639 2.863 20.037 3.123 20.459 3.542C20.878 3.962 21.138 4.361 21.355 4.923C21.519 5.345 21.715 5.98 21.768 7.15C21.825 8.416 21.838 8.796 21.838 12C21.838 15.204 21.823 15.585 21.764 16.85C21.703 18.02 21.508 18.655 21.343 19.077C21.119 19.639 20.864 20.037 20.444 20.459C20.025 20.878 19.62 21.138 19.064 21.355C18.644 21.519 17.999 21.715 16.829 21.768C15.555 21.825 15.18 21.838 11.97 21.838C8.759 21.838 8.384 21.823 7.111 21.764C5.94 21.703 5.295 21.508 4.875 21.343C4.306 21.119 3.915 20.864 3.496 20.444C3.075 20.025 2.806 19.62 2.596 19.064C2.431 18.644 2.237 17.999 2.176 16.829C2.131 15.569 2.115 15.18 2.115 11.985C2.115 8.789 2.131 8.399 2.176 7.124C2.237 5.954 2.431 5.31 2.596 4.89C2.806 4.32 3.075 3.93 3.496 3.509C3.915 3.09 4.306 2.82 4.875 2.611C5.295 2.445 5.926 2.25 7.096 2.19C8.371 2.145 8.746 2.13 11.955 2.13L12 2.16ZM12 5.838C8.595 5.838 5.838 8.598 5.838 12C5.838 15.405 8.598 18.162 12 18.162C15.405 18.162 18.162 15.402 18.162 12C18.162 8.595 15.402 5.838 12 5.838ZM12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16ZM19.846 5.595C19.846 6.39 19.2 7.035 18.406 7.035C17.611 7.035 16.966 6.389 16.966 5.595C16.966 4.801 17.612 4.156 18.406 4.156C19.199 4.155 19.846 4.801 19.846 5.595Z" />
    </svg>
  );
}

function YoutubeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 16.7998" fill="currentColor" aria-hidden {...props}>
      <path d="M12 0C12.0305 0 19.509 0.0013676 21.377 0.501953C22.4093 0.77797 23.222 1.5907 23.498 2.62305C23.9997 4.49467 24 8.40039 24 8.40039C24 8.44226 23.9969 12.3154 23.498 14.1768C23.222 15.2092 22.4094 16.0228 21.377 16.2988C19.509 16.7992 12.0305 16.7998 12 16.7998C12 16.7998 4.49493 16.8002 2.62305 16.2988C1.59066 16.0229 0.777001 15.2094 0.500977 14.1768C0.00231494 12.3154 0 8.44226 0 8.40039C0 8.40039 -0.00039844 4.49467 0.500977 2.62305C0.777012 1.59053 1.59076 0.77793 2.62305 0.501953C4.49491 0.0003437 12 0 12 0ZM9.59961 12.001L15.835 8.40039L9.59961 4.80078V12.001Z" />
    </svg>
  );
}

const COLUMNS: { title: string; links: string[] }[] = [
  {
    title: "Destinations",
    links: ["Croatia", "Greece", "Italy", "Turkey", "Caribbean", "Thailand"],
  },
  {
    title: "Charter types",
    links: ["Catamaran", "Sailing yacht", "Motor yacht", "Bareboat", "Skippered"],
  },
  {
    title: "Explore",
    links: ["Help me plan my trip", "Popular yachts", "What our customers say", "How it works"],
  },
];

const SOCIALS = [
  { label: "Instagram", Icon: InstagramIcon },
  { label: "YouTube", Icon: YoutubeIcon },
];

export default function Footer() {
  return (
    <footer className="bg-natural-900 text-white">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-10 px-4 py-[50px] md:px-[54px] 2xl:px-[70px] 2xl:py-[60px]">
        {/* Top block: brand + columns (row on desktop, centred/stacked below 2xl) */}
        <div className="flex flex-col items-center gap-8 text-center 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:text-left">
          {/* Brand */}
          <div className="flex w-full flex-col items-center gap-4 2xl:w-auto 2xl:items-start 2xl:gap-6">
            <div className="flex w-full flex-col gap-4">
              <span className="text-[28px] font-bold leading-[1.2] whitespace-nowrap">
                YachtCharter
              </span>
              <p className="w-full text-lg leading-[1.4] text-natural-100 md:text-xl">
                Explore the world by yacht.
                <br />
                Over 30,000 boats worldwide ready for your next trip.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {SOCIALS.map(({ label, Icon }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="text-white transition-opacity hover:opacity-70"
                >
                  <Icon className="size-6" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="flex w-full flex-col gap-4 md:flex-row md:justify-center 2xl:w-auto 2xl:gap-5">
            {COLUMNS.map((col) => (
              <div
                key={col.title}
                className="flex flex-col gap-2 md:flex-1 md:gap-4 2xl:w-[216px] 2xl:flex-none"
              >
                <span className="text-lg leading-[1.4] md:text-xl">{col.title}</span>
                <ul className="flex flex-col gap-2 leading-snug md:gap-3">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="block text-base leading-snug text-natural-100 transition-colors hover:text-white"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Legal bar */}
        <div className="flex flex-col items-center gap-4 text-sm leading-[1.3] tracking-[0.04em] text-natural-100 uppercase 2xl:flex-row 2xl:justify-between">
          <div className="flex gap-4">
            <a href="#" className="transition-colors hover:text-white">
              Privacy Policy
            </a>
            <a href="#" className="transition-colors hover:text-white">
              Terms of Service
            </a>
          </div>
          <span className="max-w-full">© 2026 YachtCharter Platform. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
