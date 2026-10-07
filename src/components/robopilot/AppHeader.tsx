import Link from "next/link";
import { Mark } from "@/components/landing/Mark";

/**
 * The planner's own header. Deliberately quieter than the landing nav — by
 * the time someone is here they are working, and the only navigation they
 * need is the way back out.
 */
export function AppHeader() {
  return (
    <header className="app-header">
      <Link className="app-header__brand" href="/">
        <Mark size={20} />
        <span>RoboPilot</span>
      </Link>
      <p className="app-header__where">Planner</p>
      <Link className="btn-quiet btn-quiet--sm" href="/#how-it-works">
        How a price is sourced
      </Link>
    </header>
  );
}
