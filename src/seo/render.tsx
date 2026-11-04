/* eslint-disable react-refresh/only-export-components -- Entrada exclusiva do build, sem Fast Refresh. */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { AppContent } from "../App";

export { SEO_PAGES, SITE_URL, getPageSeo, renderSeoHead } from "../lib/seo";

export function renderPublicPage(pathname: string) {
  return renderToString(
    <StaticRouter location={pathname}>
      <AppContent />
    </StaticRouter>,
  );
}
