import Link from "next/link";
import { Mark } from "./Mark";

export function SiteNav() {
  return (
    <header className="site-nav">
      <Link className="site-nav__brand" href="/">
        <Mark />
        <span>RoboPilot</span>
      </Link>

      <nav className="site-nav__links" aria-label="Sections">
        <a href="#how-it-works">How it works</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#platforms">Boards</a>
        <a href="#toolchain">API</a>
      </nav>

      <Link className="btn-primary btn-primary--sm" href="/app">
        Open the planner
      </Link>
    </header>
  );
}
