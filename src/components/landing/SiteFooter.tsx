import Link from "next/link";
import { Mark } from "./Mark";

export function SiteFooter() {
  return (
    <>
      <section className="closing">
        <h2>Bring a brief. Leave with a parts list you can defend.</h2>
        <p>
          Nothing to install and no account to make. If a price or a spec
          cannot be traced, the plan says so instead of filling the gap.
        </p>
        <Link className="btn-primary btn-primary--lg" href="/app">
          Plan a build
        </Link>
      </section>

      <footer className="site-footer">
        <div className="site-footer__brand">
          <Mark size={18} />
          <span>RoboPilot</span>
        </div>

        <p className="site-footer__note">
          Built for the AI in Applications program, Team 05. Prices are
          best-effort reads of live store pages and may be stale or wrong —
          confirm before you buy. Component specs come from the datasheets
          recorded in the source register.
        </p>

        <a
          className="site-footer__link"
          href="https://github.com/Adamtayel/RoboPilot-Ai-Backend"
          target="_blank"
          rel="noreferrer noopener"
        >
          Source on GitHub
        </a>
      </footer>
    </>
  );
}
