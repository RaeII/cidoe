import { LEGAL_CONTROLLER, LEGAL_EMAIL } from "./legal";

export const SITE_URL = "https://cidoe.com.br";
export const ABOUT_PATH = "/sobre";
export const CREATOR_SOCIAL_PROFILES = {
  linkedin: "https://www.linkedin.com/in/dev-israel-zeferino/",
  instagram: "https://www.instagram.com/rael.zeferino/",
} as const;

export const SEO_PAGES = {
  "/": {
    title: "Cidoe | Cidade 3D solidária pela proteção animal",
    description: "Conheça o Cidoe, a cidade 3D solidária onde doações para ONGs de proteção animal viram edifícios. Contribua e personalize seu prédio.",
  },
  "/sobre": {
    title: "Sobre o Cidoe | Como funciona a cidade 3D solidária",
    description: "Entenda como funciona o Cidoe, projeto de Israel Zeferino que une cidade 3D, edifícios personalizáveis e apoio a ONGs de proteção animal.",
  },
  "/termos": {
    title: "Termos de Uso · Cidoe",
    description: "Leia os Termos de Uso do Cidoe: regras da cidade 3D, contribuições para ONGs, conta, personalizações e direitos dos usuários.",
  },
  "/privacidade": {
    title: "Política de Privacidade · Cidoe",
    description: "Saiba como o Cidoe trata seus dados pessoais, utiliza cookies e protege sua privacidade, e como exercer seus direitos.",
  },
} as const;

export function getPageSeo(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page = Object.hasOwn(SEO_PAGES, path) ? SEO_PAGES[path as keyof typeof SEO_PAGES] : null;
  const admin = path === "/dale" || path.startsWith("/dale/") || path === "/admin.html";
  const title = page?.title ?? (admin ? "Administração · Cidoe" : "Página não encontrada · Cidoe");
  const description = page?.description ?? (admin ? "Acesso à administração do Cidoe." : "Esta página não existe. Volte para a cidade 3D do Cidoe.");
  const url = `${SITE_URL}${path}`;
  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Cidoe",
    url: `${SITE_URL}/`,
    description: SEO_PAGES["/"].description,
    inLanguage: "pt-BR",
    publisher: { "@id": `${SITE_URL}/#project` },
    ...(path === ABOUT_PATH ? { creator: { "@id": `${SITE_URL}/sobre#israel-zeferino` } } : {}),
  };
  const project = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#project`,
    name: "Cidoe",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.webp`,
    ...(path === ABOUT_PATH ? { email: LEGAL_EMAIL, founder: { "@id": `${SITE_URL}/sobre#israel-zeferino` } } : {}),
  };
  const structuredData = page ? {
    "@context": "https://schema.org",
    "@graph": [
      website,
      project,
      {
        "@type": path === ABOUT_PATH ? "AboutPage" : "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: "pt-BR",
        isPartOf: { "@id": website["@id"] },
        ...(path === ABOUT_PATH ? { mainEntity: { "@id": project["@id"] } } : {}),
      },
      ...(path === ABOUT_PATH ? [{
        "@type": "Person",
        "@id": `${SITE_URL}/sobre#israel-zeferino`,
        name: LEGAL_CONTROLLER,
        url: `${SITE_URL}/sobre#israel-zeferino`,
        sameAs: Object.values(CREATOR_SOCIAL_PROFILES),
      }] : []),
    ],
  } : null;

  return {
    title, description, url, structuredData,
    canonical: page ? url : null,
    robots: page ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" : `noindex, ${admin ? "nofollow" : "follow"}`,
  };
}

export function renderSeoHead(pathname: string) {
  const seo = getPageSeo(pathname);
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  const meta = (attribute: string, key: string, value: string) => `<meta ${attribute}="${key}" content="${escape(value)}" />`;
  return [
    "<!--seo:start-->",
    `<title>${escape(seo.title)}</title>`,
    meta("name", "application-name", "Cidoe"),
    meta("name", "description", seo.description),
    meta("name", "robots", seo.robots),
    ...(seo.canonical ? [`<link rel="canonical" href="${escape(seo.canonical)}" />`] : []),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "Cidoe"),
    meta("property", "og:locale", "pt_BR"),
    meta("property", "og:url", seo.url),
    meta("property", "og:title", seo.title),
    meta("property", "og:description", seo.description),
    meta("property", "og:image", `${SITE_URL}/og-image.jpg`),
    meta("property", "og:image:type", "image/jpeg"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", "Logo do Cidoe"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", seo.title),
    meta("name", "twitter:description", seo.description),
    meta("name", "twitter:image", `${SITE_URL}/og-image.jpg`),
    meta("name", "twitter:image:alt", "Logo do Cidoe"),
    `<script id="page-schema" type="application/ld+json">${JSON.stringify(seo.structuredData).replace(/</g, "\\u003c")}</script>`,
    "<!--seo:end-->",
  ].join("\n");
}
