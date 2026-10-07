"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BoardFallback } from "./BoardFallback";

/**
 * The 3D scene is a separate chunk, requested only once we have decided this
 * visitor should get it. `ssr: false` because it touches WebGL, and the
 * import sits behind the capability check below, so three.js is never
 * downloaded on a phone or for someone who asked for reduced motion.
 */
const BoardScene = dynamic(() => import("./BoardScene"), {
  ssr: false,
  loading: () => <BoardFallback />,
});

/**
 * The page's one orchestrated load reveal is done in CSS (see .reveal in
 * globals.css), not with a motion library.
 *
 * This started as framer-motion variants and was changed after watching it
 * fail: the headline is authored at opacity 0 and only becomes visible when
 * the library starts the animation, so anything that delays or breaks
 * hydration leaves a blank hero. That happened here on React 19. A CSS
 * keyframe runs off the stylesheet, cannot depend on hydration, and ends in
 * the visible state no matter what — and under prefers-reduced-motion the
 * global rule collapses it to its final frame instantly.
 */
function useWantsRichScene() {
  // Starts false so the server markup and the first client paint agree (both
  // show the still board); upgrades after mount if the device can carry it.
  const [rich, setRich] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 860px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setRich(wide.matches && !calm.matches);
    sync();
    wide.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    return () => {
      wide.removeEventListener("change", sync);
      calm.removeEventListener("change", sync);
    };
  }, []);

  return rich;
}

export function Hero() {
  const richScene = useWantsRichScene();

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <h1 className="reveal reveal--1">
          Describe the robot.
          <br />
          Get the parts list that survives contact with a bench.
        </h1>

        <p className="hero-lede reveal reveal--2">
          RoboPilot turns a project brief into an architecture, a priced bill of
          materials, logic-level checks between every part, a milestone chain and
          a scored risk register. Prices and compatibility come from a verified
          catalog and live store pages — the model proposes, it never quotes.
        </p>

        <div className="hero-actions reveal reveal--3">
          <Link className="btn-primary btn-primary--lg" href="/app">
            Plan a build
          </Link>
          <a className="btn-quiet" href="#how-it-works">
            See how a price is sourced
          </a>
        </div>

        <dl className="hero-readout reveal reveal--4">
          <div>
            <dt>catalog</dt>
            <dd className="mono">26 parts</dd>
          </div>
          <div>
            <dt>price sources</dt>
            <dd className="mono">4 stores</dd>
          </div>
          <div>
            <dt>guessed prices</dt>
            <dd className="mono readout-zero">0</dd>
          </div>
        </dl>
      </div>

      <div className="hero-stage reveal reveal--stage">
        <div className="hero-stage__frame">
          {richScene ? <BoardScene /> : <BoardFallback />}
          <div className="hero-stage__caption mono">
            <span className="hero-stage__dot" aria-hidden="true" />
            <span>4 nets live</span>
            <span className="hero-stage__sep" aria-hidden="true" />
            <span>3.3 V logic</span>
          </div>
        </div>
      </div>
    </section>
  );
}
