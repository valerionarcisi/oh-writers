import { createFileRoute, redirect } from "@tanstack/react-router";

// `/teams` has no listing page of its own — team creation lives at `/teams/new`
// and individual teams at `/teams/$slug`. A bare `/teams` deep link used to hit
// the router's generic Not Found (audit 2026-06-03, F-06). Redirect it to the
// team creation page so the URL always resolves. [OHW-056]
export const Route = createFileRoute("/_app/teams/")({
  beforeLoad: () => {
    throw redirect({ to: "/teams/new" });
  },
});
