import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getPageSeo } from "@/lib/seo";

export function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const seo = getPageSeo(pathname);
    document.title = seo.title;
    for (const [selector, value] of [
      ['meta[name="description"]', seo.description],
      ['meta[name="robots"]', seo.robots],
      ['meta[property="og:title"]', seo.title],
      ['meta[property="og:description"]', seo.description],
      ['meta[property="og:url"]', seo.url],
      ['meta[name="twitter:title"]', seo.title],
      ['meta[name="twitter:description"]', seo.description],
    ]) document.head.querySelector(selector)?.setAttribute("content", value);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (seo.canonical) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = seo.canonical;
    } else canonical?.remove();
    const schema = document.getElementById("page-schema");
    if (schema) schema.textContent = JSON.stringify(seo.structuredData);
  }, [pathname]);
  return null;
}
