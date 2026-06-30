import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Features,
  resolveFeatures,
  marketFromLocale,
  DEFAULT_PLAN,
} from "@oh-writers/domain";
import { titleHead } from "~/lib/document-title";
import { assertValidProjectId } from "~/lib/project-route";
import { OpportunitiesPage } from "~/features/fundraising/components/OpportunitiesPage";

export const Route = createFileRoute("/_app/projects/$id_/opportunities")({
  // Fundraising (Italian "bandi") is an Italian-market feature. On the
  // international market it is detached, so this route redirects to the project
  // home — server-side in beforeLoad, before any render, so a direct deep link
  // in EN never flashes the page.
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    const { resolveLocale } =
      await import("~/features/i18n/resolve-locale.server");
    const locale = await resolveLocale();
    const enabled = resolveFeatures({
      market: marketFromLocale(locale),
      plan: DEFAULT_PLAN,
    });
    if (!enabled.has(Features.FUNDRAISING)) {
      throw redirect({ to: "/projects/$id", params: { id: params.id } });
    }
  },
  head: () => titleHead("Opportunità"),
  component: OpportunitiesRoute,
});

function OpportunitiesRoute() {
  const { id } = Route.useParams();
  return <OpportunitiesPage projectId={id} />;
}
