#!/usr/bin/env node
// Genera el sitio estático a partir de data/site.json y data/projects.json.
// Sin dependencias: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const siteBase = readJson('data/site.json');
const i18n = readJson('data/i18n.json');
let site = siteBase;
let seo = site.seo || {};
const catalog = readJson('data/projects.json');

// Versión por contenido: el navegador descarga el CSS/JS nuevo en cuanto cambian.
const hashOf = (rel) => createHash('md5').update(readFileSync(join(root, rel))).digest('hex').slice(0, 8);
const V = { css: hashOf('assets/css/style.css'), js: hashOf('assets/js/main.js') };

const baseGroups = catalog.groups;
const baseProjects = catalog.projects.filter((p) => p.published);
let groups = baseGroups;
let projects = baseProjects;

// ---------- validación ----------
const problems = [];
const seen = new Set();
for (const p of projects) {
  if (!p.slug || !p.title) problems.push(`Proyecto sin slug o título: ${JSON.stringify(p).slice(0, 80)}`);
  if (seen.has(p.slug)) problems.push(`Slug repetido: ${p.slug}`);
  seen.add(p.slug);
  if (p.collection) {
    const vids = p.collection.videos || [];
    if (!vids.length) problems.push(`${p.slug}: la colección no tiene vídeos (o ponlo con "published": false)`);
    vids.forEach((v, i) => {
      if (!v.title || !v.videoId) problems.push(`${p.slug}: el vídeo ${i + 1} necesita title y videoId`);
    });
  } else if (!p.url) problems.push(`${p.slug}: falta url (o ponlo con "published": false)`);
  if (!existsSync(join(root, p.image))) problems.push(`${p.slug}: no existe la imagen ${p.image}`);
  if (!groups.some((g) => g.id === p.group)) problems.push(`${p.slug}: grupo desconocido "${p.group}"`);
}
if (problems.length) {
  console.error('Errores en data/projects.json:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// ---------- utilidades ----------
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PLATFORMS = {
  youtube: { label: 'YouTube', embed: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` },
  vimeo: { label: 'Vimeo', embed: (id) => `https://player.vimeo.com/video/${id}?autoplay=1` },
  filmin: { label: 'Filmin', embed: null },
  'vimeo-ondemand': { label: 'Vimeo On Demand', embed: null },
};

const hasLoop = (p) => existsSync(join(root, 'assets/loops', `${p.slug}.mp4`));
const slugify = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const year = new Date().getFullYear();
const visibleSocials = siteBase.socials.filter((s) => s.show);
const visibleClients = siteBase.clients.filter((c) => c.show);

const write = (rel, content) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

// ---------- plantilla común ----------
// Correo ofuscado: en el HTML solo hay base64; main.js lo monta. Sin JS se ve "usuario [at] dominio [dot] com".
const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
const mailLink = (cls) =>
  `<a class="${cls}" data-m="${b64(site.email)}" href="#">${esc(site.email.replace('@', ' [at] ').replace(/\.(?=[^.]*$)/, ' [dot] '))}</a>`;


// ---------- idioma ----------
// El inglés vive en la raíz; el resto en /es/ y /eu/. Cada pasada de build llama a setLang().
let lang = 'en';
let PRE = ''; // prefijo de ruta del idioma ('', 'es/', 'eu/')
let A = ''; // '../' si estamos dentro de /es/ o /eu/ (para llegar a assets/ en la raíz)
let UI = i18n.en.ui;
const fmt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const t = (k, v) => fmt(UI[k] ?? i18n.en.ui[k] ?? k, v);
const U = (path) => `${site.url}/${PRE}${path}`; // URL absoluta de una página en el idioma actual
const up = (d) => '../'.repeat(d) + A; // ruta relativa a la raíz de assets desde una página de profundidad d

function setLang(code) {
  const L = i18n[code];
  const info = i18n.langs.find((l) => l.code === code);
  lang = code;
  PRE = info.prefix;
  A = PRE ? '../' : '';
  UI = { ...i18n.en.ui, ...L.ui };
  const ov = L.site || {};
  site = {
    ...siteBase,
    ...ov,
    about: { ...siteBase.about, ...(ov.about || {}) },
    seo: { ...siteBase.seo, ...(ov.seo || {}), homeIntro: { ...siteBase.seo.homeIntro, ...((ov.seo || {}).homeIntro || {}) } },
  };
  seo = site.seo;
  groups = baseGroups.map((g) => ({ ...g, label: (L.groups || {})[g.id] ?? g.label }));
  projects = baseProjects.map((p) => ({
    ...p,
    category: (L.category || {})[p.category] ?? p.category,
    role: (L.role || {})[p.role] ?? p.role,
    collection: p.collection ? { ...p.collection, intro: ((L.projects || {})[p.slug] || {}).intro ?? p.collection.intro } : undefined,
  }));
}

// ---------- SEO: datos estructurados ----------
const personId = `${siteBase.url}/#julen`;
const personNode = () => ({
  '@type': ['Person', 'ProfessionalService'],
  '@id': personId,
  name: site.name,
  jobTitle: site.role,
  description: site.description,
  url: site.url,
  image: `${site.url}/${site.about.photo}`,
  address: { '@type': 'PostalAddress', addressLocality: site.location, addressRegion: seo.region, addressCountry: 'ES' },
  ...(seo.geo ? { geo: { '@type': 'GeoCoordinates', latitude: seo.geo[0], longitude: seo.geo[1] } } : {}),
  areaServed: (seo.areaServed || []).map((n) => ({ '@type': 'Place', name: n })),
  knowsAbout: seo.serviceTypes || [],
  makesOffer: (seo.serviceTypes || []).map((n) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: n, areaServed: seo.region } })),
  knowsLanguage: ['en', 'es', 'eu'],
  sameAs: visibleSocials.map((s) => s.url),
});
const siteNode = () => ({ '@type': 'WebSite', '@id': `${site.url}/#website`, url: site.url, name: site.name, inLanguage: lang, publisher: { '@id': personId } });
const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: U(path) })),
});
const workNode = (p, text) => ({
  '@type': 'CreativeWork',
  '@id': `${U(`work/${p.slug}/`)}#work`,
  name: p.title,
  url: U(`work/${p.slug}/`),
  image: `${site.url}/${p.image}`,
  inLanguage: lang,
  genre: p.category || undefined,
  description: text || undefined,
  creator: { '@id': personId },
  ...(p.artist ? { about: p.artist } : {}),
  ...(p.url && !p.collection ? { sameAs: p.url } : {}),
});
const graph = (...nodes) => JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });

function shell({ depth, path, title, description, image, body, bodyClass = '', current = '', jsonld = '', abs = false, cta = true, imageAlt = '', noindex = false, noLang = false }) {
  const base = abs ? '/' : '../'.repeat(depth); // raíz del idioma actual
  const ab = abs ? '/' : '../'.repeat(depth) + A; // raíz del sitio (assets)
  const home = abs ? '/' : base || './';
  const canonical = U(path);
  const ogImage = `${site.url}/${image || 'assets/img/brand/og.jpg'}`;
  const info = i18n.langs.find((l) => l.code === lang);
  const nav = [
    { id: 'work', label: t('work'), href: `${home === './' ? '' : home}#work` },
    { id: 'about', label: t('about'), href: `${base}about/` },
    { id: 'contact', label: t('contact'), href: `${base}contact/` },
  ];
  const langHref = (l) => (abs ? `/${l.prefix}` : '../'.repeat(depth + (PRE ? 1 : 0)) + l.prefix + path || './');
  const alternates = noLang
    ? ''
    : i18n.langs.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${esc(`${siteBase.url}/${l.prefix}${path}`)}">`).join('\n') +
      `\n<link rel="alternate" hreflang="x-default" href="${esc(`${siteBase.url}/${path}`)}">\n`;
  const switcher = noLang
    ? ''
    : `<div class="lang">
      <button type="button" class="lang-current" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('langAria'))}: ${esc(info.name)}">${info.label}</button>
      <ul class="lang-menu">
${i18n.langs
  .filter((l) => l.code !== lang)
  .map((l) => `        <li><a href="${langHref(l)}" lang="${l.code}" hreflang="${l.code}" title="${esc(l.name)}">${l.label}</a></li>`)
  .join('\n')}
      </ul>
    </div>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}">
<meta name="theme-color" content="#050505">
<link rel="canonical" href="${esc(canonical)}">
${alternates}<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:locale" content="${info.locale}">
<meta property="og:image:width" content="${image ? 800 : 1200}">
<meta property="og:image:height" content="${image ? 600 : 630}">
<meta property="og:image:alt" content="${esc(imageAlt || t('ogAlt', { name: site.name, loc: site.location }))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta name="author" content="${esc(site.name)}">
<meta name="geo.region" content="${esc(seo.regionCode || 'ES-PV')}">
<meta name="geo.placename" content="${esc(site.location)}">
<link rel="icon" href="${ab}assets/img/brand/favicon.png">
<link rel="preload" href="${ab}assets/fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${ab}assets/css/style.css?v=${V.css}">
${bodyClass === 'page-home' ? `<script>try{var d=document.documentElement,s=sessionStorage;if(/[?&]intro\\b/.test(location.search)||!s.getItem('intro')){s.setItem('intro','1')}else{d.classList.add('no-intro')}}catch(e){}</script>` : ''}
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
</head>
<body id="top" class="${bodyClass}">
<a class="skip" href="#main">${esc(t('skip'))}</a>
<header class="site-header">
  <a class="logo" href="${home}">
    <img src="${ab}assets/img/brand/logo-light@2x.png" width="132" height="59" alt="${esc(t('logoAlt', { name: site.name }))}">
  </a>
  <nav class="nav" aria-label="${esc(t('navAria'))}">
${nav
  .map((n) => `    <a href="${n.href}"${current === n.id ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
  .join('\n')}
  </nav>
  <div class="header-end">
    <p class="clock"><span>${esc(site.location)}</span> <time data-tz="${esc(site.timezone)}" datetime=""></time></p>
    ${switcher}
  </div>
</header>
${body}
<footer class="site-footer">
${cta ? `  <p class="footer-lead">${esc(t('footerLead'))}</p>
  <a class="footer-cta" href="${base}contact/">${esc(t('footerCta'))}</a>
` : ''}  ${mailLink('footer-mail')}
  <ul class="socials">
${visibleSocials.map((s) => `    <li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('\n')}
  </ul>
  <p class="legal">© ${year} ${esc(site.name)}</p>
  <a class="to-top" href="#top">${esc(t('toTop'))}</a>
</footer>
<script src="${ab}assets/js/main.js?v=${V.js}" defer></script>
</body>
</html>
`;
}

// ---------- piezas ----------
function tile(p, i) {
  const loop = hasLoop(p);
  const eager = i < 2;
  return `      <li class="tile" data-group="${esc(p.group)}" data-image="${esc(A + p.image)}">
        <a href="work/${esc(p.slug)}/" data-cursor>
          <div class="frame">
            <img src="${esc(A + p.image)}" width="800" height="600" alt=""${eager ? '' : ' loading="lazy"'} decoding="async">${
    loop ? `\n            <video muted loop playsinline preload="none" tabindex="-1" aria-hidden="true" data-src="${A}assets/loops/${esc(p.slug)}.mp4"></video>` : ''
  }
          </div>
          <div class="caption">
            <div class="cap-main">
              <h3>${esc(p.title)}</h3>
              ${p.artist ? `<p class="artist">${esc(p.artist)}</p>` : '<p class="artist"></p>'}
            </div>
            <p class="cat">${esc(p.category)}</p>
          </div>
        </a>
      </li>`;
}

// ---------- home ----------
function homePage() {
  const body = `<main id="main">
  <section class="hero">
    <h1>${esc(site.tagline)}</h1>
    <p class="hero-note">${t('heroNote', { role: esc(site.roleShort), loc: esc(site.location) })}</p>
  </section>

  <section id="work" class="work" aria-labelledby="work-title">
    <div class="work-bar">
      <h2 id="work-title">${esc(t('work'))}</h2>
      <div class="views" role="group" aria-label="${esc(t('viewAria'))}">
        <button type="button" data-view-btn="grid" aria-pressed="true">${esc(t('grid'))}</button>
        <button type="button" data-view-btn="list" aria-pressed="false">${esc(t('list'))}</button>
      </div>
    </div>
    <ul class="grid">
${projects.map(tile).join('\n')}
    </ul>
  </section>

  <section class="local" aria-labelledby="local-title">
    <h2 id="local-title">${esc(seo.homeIntro.heading)}</h2>
    <p>${esc(seo.homeIntro.text)}</p>
${seo.homeIntro.es ? `    <p lang="es">${esc(seo.homeIntro.es)}</p>\n` : ''}  </section>
</main>`;
  const list = {
    '@type': 'CollectionPage',
    '@id': `${U('')}#work`,
    url: U(''),
    name: site.title,
    inLanguage: lang,
    about: { '@id': personId },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: projects.map((p, n) => ({ '@type': 'ListItem', position: n + 1, url: U(`work/${p.slug}/`), name: p.title })),
    },
  };
  return shell({
    depth: 0,
    path: '',
    title: site.title,
    description: site.description,
    body,
    bodyClass: 'page-home',
    current: 'work',
    jsonld: graph(personNode(), siteNode(), list),
  });
}

// ---------- colección (proyecto con varios vídeos, p. ej. Gaupasa) ----------
function collectionPage(p, i) {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const videos = p.collection.videos;
  const subTile = (v, n) => {
    const vslug = v.slug || slugify(v.title);
    const loopRel = `assets/loops/${p.slug}/${vslug}.mp4`;
    const loop = existsSync(join(root, loopRel));
    const thumb = v.image ? `${up(2)}${v.image}` : `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;
    const fallback = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
    const onerror = v.image ? '' : ` onerror="this.onerror=null;this.src='${fallback}'"`;
    return `      <li class="tile">
        <a href="https://www.youtube.com/watch?v=${esc(v.videoId)}" target="_blank" rel="noopener" data-cursor>
          <div class="frame">
            <img src="${esc(thumb)}" width="1280" height="720" alt=""${n < 2 ? '' : ' loading="lazy"'} decoding="async"${onerror}>${
      loop ? `\n            <video muted loop playsinline preload="none" tabindex="-1" aria-hidden="true" data-src="${up(2)}${esc(loopRel)}"></video>` : ''
    }
          </div>
          <div class="caption">
            <div class="cap-main">
              <h3>${esc(v.title)}</h3>
              <p class="artist"></p>
            </div>
            <p class="cat">YouTube</p>
          </div>
        </a>
      </li>`;
  };
  const facts = [
    p.artist && [t('artist'), p.artist],
    p.category && [t('type'), p.category],
    p.role && [t('role'), p.role],
    [t('watchOn'), 'YouTube'],
  ].filter(Boolean);
  const body = `<main id="main" class="project collection">
  <a class="back" href="../../#work">${esc(t('back'))}</a>
  <h1>${esc(p.title)}</h1>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
  </dl>
  <div class="collection-intro">
${p.collection.intro.map((x) => `    <p>${esc(x)}</p>`).join('\n')}
  </div>
  <ul class="grid">
${videos.map(subTile).join('\n')}
  </ul>
  <nav class="pager" aria-label="${esc(t('moreAria'))}">
    <a class="prev" href="../${esc(prev.slug)}/"><span>${esc(t('prev'))}</span><strong>${esc(prev.title)}</strong></a>
    <a class="next" href="../${esc(next.slug)}/"><span>${esc(t('next'))}</span><strong>${esc(next.title)}</strong></a>
  </nav>
</main>`;
  return shell({
    depth: 2,
    path: `work/${p.slug}/`,
    title: t('collTitle', { who: `${p.title}, ${p.artist}`, name: site.name }),
    description: t('collDesc', { intro: p.collection.intro[0], artist: p.artist, name: site.name }),
    image: p.image,
    imageAlt: `${p.title}, ${p.artist}`,
    jsonld: graph(personNode(), siteNode(), crumbs([[t('work'), ''], [p.title, `work/${p.slug}/`]]), workNode(p, p.collection.intro[0])),
    body,
    bodyClass: 'page-project',
    current: 'work',
  });
}

// ---------- proyecto ----------
function projectPage(p, i) {
  if (p.collection) return collectionPage(p, i);
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const plat = PLATFORMS[p.platform] || { label: 'Web', embed: null };
  const embedUrl = plat.embed && p.videoId ? plat.embed(p.videoId) : '';
  const facts = [
    p.artist && [p.group === 'videoclip' ? t('artist') : t('with'), p.artist],
    p.category && [t('type'), p.category],
    p.role && [t('role'), p.role],
    [t('watchOn'), plat.label],
  ].filter(Boolean);
  const still = t('stillAlt', { t: p.title });

  const player = embedUrl
    ? `<div class="player" data-cursor data-embed="${esc(embedUrl)}" data-title="${esc(p.title)}">
      <img src="${up(2)}${esc(p.image)}" width="800" height="600" alt="${esc(still)}">
      <button type="button" class="player-btn" aria-label="${esc(t('play', { t: p.title }))}"></button>
    </div>`
    : `<a class="player" data-cursor href="${esc(p.url)}" target="_blank" rel="noopener">
      <img src="${up(2)}${esc(p.image)}" width="800" height="600" alt="${esc(still)}">
      <span class="player-label">${esc(t('watchOnX', { x: plat.label }))}</span>
    </a>`;

  const body = `<main id="main" class="project">
  <a class="back" href="../../#work">${esc(t('back'))}</a>
  <h1>${esc(p.title)}</h1>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
  </dl>
  ${player}
  <p class="external"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(t('openOn', { x: plat.label }))}</a></p>
  <nav class="pager" aria-label="${esc(t('moreAria'))}">
    <a class="prev" href="../${esc(prev.slug)}/"><span>${esc(t('prev'))}</span><strong>${esc(prev.title)}</strong></a>
    <a class="next" href="../${esc(next.slug)}/"><span>${esc(t('next'))}</span><strong>${esc(next.title)}</strong></a>
  </nav>
</main>`;
  const who = p.artist ? `${p.title}, ${p.artist}` : p.title;
  const cat = p.category || t('projectsWord');
  return shell({
    depth: 2,
    path: `work/${p.slug}/`,
    title: t('projTitle', { who, cat, name: site.name }),
    description: t('projDesc', {
      who,
      cat: cat.toLowerCase(),
      roleP: p.role ? ` (${p.role.toLowerCase()})` : '',
      name: site.name,
      loc: site.location,
      region: seo.region,
    }),
    image: p.image,
    imageAlt: still,
    jsonld: graph(personNode(), siteNode(), crumbs([[t('work'), ''], [p.title, `work/${p.slug}/`]]), workNode(p, '')),
    body,
    bodyClass: 'page-project',
    current: 'work',
  });
}

// ---------- sobre mí ----------
function aboutPage() {
  const a = site.about;
  const body = `<main id="main" class="about">
  <h1 class="lead">${esc(a.lead)}</h1>
  <div class="about-body">
    <img class="portrait" src="../${A}${esc(a.photo)}" width="1200" height="1607" alt="${esc(a.photoAlt)}">
    <div class="about-text">
${a.body.map((x) => `      <p>${esc(x)}</p>`).join('\n')}
    </div>
  </div>
  <section class="services" aria-labelledby="services-title">
    <h2 id="services-title">${esc(t('servicesTitle'))}</h2>
    <div class="services-grid">
${site.services.map((s) => `      <article><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('\n')}
    </div>
  </section>
  <section class="faq" aria-labelledby="faq-title">
    <h2 id="faq-title">${esc(t('faqTitle'))}</h2>
    <dl>
${(seo.faq || []).map((f) => `      <div><dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd></div>`).join('\n')}
    </dl>
  </section>
  <section class="clients" aria-labelledby="clients-title">
    <h2 id="clients-title">${esc(t('clientsTitle'))}</h2>
    <ul>
${visibleClients
  .map(
    (c) =>
      `      <li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">` : ''}<img src="../${A}${esc(c.logo)}" width="140" height="51" alt="${esc(c.name)}" loading="lazy">${c.url ? '</a>' : ''}</li>`
  )
  .join('\n')}
    </ul>
  </section>
</main>`;
  return shell({
    depth: 1,
    path: 'about/',
    title: t('aboutTitle'),
    description: t('aboutDesc', { name: site.name, role: site.role.toLowerCase(), loc: site.location, region: seo.region, b0: a.body[0] }),
    image: a.photo,
    imageAlt: a.photoAlt,
    jsonld: graph(personNode(), siteNode(), crumbs([[t('about'), 'about/']]), {
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: (seo.faq || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }),
    body,
    bodyClass: 'page-about',
    current: 'about',
  });
}

// ---------- contacto ----------
function contactPage() {
  const body = `<main id="main" class="contact">
  <h1>${esc(t('contactH1'))}</h1>
  <p class="contact-sub">${esc(t('contactSub'))}</p>
  <div class="contact-grid">
    <form id="contact-form" novalidate data-endpoint="${esc(site.contactEndpoint)}" data-m="${b64(site.email)}" data-msg-invalid="${esc(t('msgInvalid'))}" data-msg-sending="${esc(t('msgSending'))}" data-msg-sent="${esc(t('msgSent'))}" data-msg-error="${esc(t('msgError'))}" data-msg-opening="${esc(t('msgOpening'))}" data-msg-subject="${esc(t('msgSubject'))}">
      <label for="name">${esc(t('name'))}</label>
      <input id="name" name="name" type="text" autocomplete="name" required>
      <label for="email">${esc(t('email'))}</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <label for="message">${esc(t('message'))}</label>
      <textarea id="message" name="message" rows="7" required></textarea>
      <button type="submit">${esc(t('send'))}</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
    <aside class="contact-side">
      <p>${esc(t('contactSide'))}</p>
      <p>${mailLink('text-link')}</p>
      <p class="contact-place">${esc(t('place', { loc: site.location }))}</p>
    </aside>
  </div>
</main>`;
  return shell({
    depth: 1,
    path: 'contact/',
    title: t('contactTitle'),
    description: t('contactDesc', { name: site.name, role: site.role.toLowerCase(), loc: site.location }),
    jsonld: graph(personNode(), siteNode(), crumbs([[t('contact'), 'contact/']])),
    body,
    bodyClass: 'page-contact',
    cta: false,
    current: 'contact',
  });
}

// ---------- 404 ----------
function notFoundPage() {
  const body = `<main id="main" class="notfound">
  <h1>${esc(t('notFoundH1'))}</h1>
  <p><a class="text-link" href="/">${esc(t('back'))}</a></p>
</main>`;
  return shell({
    depth: 0,
    abs: true,
    path: '404.html',
    title: `${t('notFoundTitle')} · ${site.name}`,
    description: t('notFoundDesc'),
    body,
    bodyClass: 'page-404',
    noindex: true,
    noLang: true,
    cta: false,
  });
}

// ---------- escribir ----------
const paths = ['', 'about/', 'contact/', ...baseProjects.map((p) => `work/${p.slug}/`)];
for (const l of i18n.langs) {
  setLang(l.code);
  write(`${PRE}index.html`, homePage());
  projects.forEach((p, i) => write(`${PRE}work/${p.slug}/index.html`, projectPage(p, i)));
  write(`${PRE}about/index.html`, aboutPage());
  write(`${PRE}contact/index.html`, contactPage());
}
setLang('en');
write('404.html', notFoundPage());

const today = new Date().toISOString().slice(0, 10);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${paths
    .flatMap((u) =>
      i18n.langs.map((l) => {
        const alts = i18n.langs.map((a) => `<xhtml:link rel="alternate" hreflang="${a.code}" href="${site.url}/${a.prefix}${u}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${site.url}/${u}"/>`;
        return `  <url><loc>${site.url}/${l.prefix}${u}</loc><lastmod>${today}</lastmod>${alts}</url>`;
      })
    )
    .join('\n')}\n</urlset>\n`
);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
write(
  'llms.txt',
  `# ${site.name}

> ${site.description}

${seo.homeIntro.text} Based in ${site.location}, ${seo.region}.

## Pages
- [Work](${site.url}/): selected music videos, documentaries and other pieces
- [About](${site.url}/about/): who he is, how he works, equipment and clients
- [Contact](${site.url}/contact/): start a project

## Languages
- English: ${site.url}/
- Castellano: ${site.url}/es/
- Euskara: ${site.url}/eu/

## Projects
${projects.map((p) => `- [${p.title}${p.artist ? ' · ' + p.artist : ''}](${site.url}/work/${p.slug}/)${p.category ? ': ' + p.category : ''}`).join('\n')}
`
);
write('.nojekyll', '');

const loops = projects.filter(hasLoop).length;
console.log(`OK: ${projects.length} proyectos publicados, ${loops} con bucle de vídeo, ${paths.length * i18n.langs.length + 1} páginas en ${i18n.langs.length} idiomas.`);
