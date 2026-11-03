/* eslint-disable react-refresh/only-export-components -- Entrada exclusiva do build, sem Fast Refresh. */
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { DonationInfoSection } from "../components/html/DonationInfoSection";
import About from "../pages/About";
import NotFound from "../pages/NotFound";
import Terms from "../pages/legal/Terms";
import Privacy from "../pages/legal/Privacy";

export { SEO_PAGES, SITE_URL, getPageSeo, renderSeoHead } from "../lib/seo";

export function renderPublicPage(pathname: string) {
  const noop = () => {};
  const pages = {
    "/": <DonationInfoSection donations={[]} ongs={[]} filter={{}} mediaReady={false}
      loadState={{ status: "loading", loadedBytes: 0, totalBytes: null }}
      onFilterChange={noop} onViewOng={noop} onRetry={noop} />,
    "/sobre": <About />,
    "/termos": <Terms />,
    "/privacidade": <Privacy />,
  };
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      {pages[pathname as keyof typeof pages] ?? <NotFound />}
    </StaticRouter>,
  );
}
