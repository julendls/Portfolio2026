#!/usr/bin/env node
// Genera el sitio estático a partir de data/site.json y data/projects.json.
// Sin dependencias: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const site = readJson('data/site.json');
const catalog = readJson('data/projects.json');

// Versión por contenido: el navegador descarga el CSS/JS nuevo en cuanto cambian.
const hashOf = (rel) => createHash('md5').update(readFileSync(join(root, rel))).digest('hex').slice(0, 8);
const V = { css: hashOf('assets/css/style.css'), js: hashOf('assets/js/main.js') };

const groups = catalog.groups;
const projects = catalog.projects.filter((p) => p.published);

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
const visibleSocials = site.socials.filter((s) => s.show);
const visibleClients = site.clients.filter((c) => c.show);

const write = (rel, content) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

// ---------- plantilla común ----------
function shell({ depth, path, title, description, image, body, bodyClass = '', current = '', jsonld = '', abs = false, cta = true }) {
  const base = abs ? '/' : '../'.repeat(depth);
  const home = abs ? '/' : base || './';
  const canonical = `${site.url}/${path}`;
  const ogImage = `${site.url}/${image || site.about.photo}`;
  const nav = [
    { id: 'work', label: 'Work', href: `${home === './' ? '' : home}#work` },
    { id: 'about', label: 'About', href: `${base}about/` },
    { id: 'contact', label: 'Contact', href: `${base}contact/` },
  ];
  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#050505">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${base}assets/img/brand/favicon.png">
<link rel="preload" href="${base}assets/fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/css/style.css?v=${V.css}">
${bodyClass === 'page-home' ? `<script>try{var d=document.documentElement,s=sessionStorage;if(/[?&]intro\\b/.test(location.search)||!s.getItem('intro')){s.setItem('intro','1')}else{d.classList.add('no-intro')}}catch(e){}</script>` : ''}
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
</head>
<body id="top" class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="logo" href="${home}">
    <img src="${base}assets/img/brand/logo-light@2x.png" width="132" height="59" alt="${esc(site.name)}, filmmaker">
  </a>
  <nav class="nav" aria-label="Main">
${nav
  .map((n) => `    <a href="${n.href}"${current === n.id ? ' aria-current="page"' : ''}>${n.label}</a>`)
  .join('\n')}
  </nav>
  <p class="clock"><span>${esc(site.location)}</span> <time data-tz="${esc(site.timezone)}" datetime=""></time></p>
</header>
${body}
<footer class="site-footer">
${cta ? `  <p class="footer-lead">Like what you see?</p>
  <a class="footer-cta" href="${base}contact/">Got a story? Let's tell it.</a>
` : ''}  <a class="footer-mail" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
  <ul class="socials">
${visibleSocials.map((s) => `    <li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('\n')}
  </ul>
  <p class="legal">© ${year} ${esc(site.name)}</p>
  <a class="to-top" href="#top">Back to top</a>
</footer>
<script src="${base}assets/js/main.js?v=${V.js}" defer></script>
</body>
</html>
`;
}

// ---------- piezas ----------
function tile(p, i) {
  const loop = hasLoop(p);
  const eager = i < 2;
  return `      <li class="tile" data-group="${esc(p.group)}" data-image="${esc(p.image)}">
        <a href="work/${esc(p.slug)}/" data-cursor>
          <div class="frame">
            <img src="${esc(p.image)}" width="800" height="600" alt=""${eager ? '' : ' loading="lazy"'} decoding="async">${
    loop ? `\n            <video muted loop playsinline preload="none" tabindex="-1" aria-hidden="true" data-src="assets/loops/${esc(p.slug)}.mp4"></video>` : ''
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
    <p class="hero-note">${esc(site.roleShort)} based in <span class="nb">${esc(site.location)}</span>.</p>
  </section>

  <section id="work" class="work" aria-labelledby="work-title">
    <div class="work-bar">
      <h2 id="work-title">Work</h2>
      <div class="filters" role="group" aria-label="Filter by type">
        <button type="button" data-filter="all" aria-pressed="true">All</button>
${groups
  .filter((g) => projects.some((p) => p.group === g.id))
  .map((g) => `        <button type="button" data-filter="${esc(g.id)}" aria-pressed="false">${esc(g.label)}</button>`)
  .join('\n')}
      </div>
      <div class="views" role="group" aria-label="View">
        <button type="button" data-view-btn="grid" aria-pressed="true">Grid</button>
        <button type="button" data-view-btn="list" aria-pressed="false">List</button>
      </div>
    </div>
    <ul class="grid">
${projects.map(tile).join('\n')}
    </ul>
  </section>
</main>`;
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    jobTitle: site.role,
    url: site.url,
    email: site.email,
    address: { '@type': 'PostalAddress', addressLocality: site.location, addressCountry: 'ES' },
    sameAs: visibleSocials.map((s) => s.url),
  };
  return shell({
    depth: 0,
    path: '',
    title: site.title,
    description: site.description,
    body,
    bodyClass: 'page-home',
    current: 'work',
    jsonld: JSON.stringify(person),
  });
}

// ---------- proyecto ----------
// ---------- colección (proyecto con varios vídeos, p. ej. Gaupasa) ----------
function collectionPage(p, i) {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const videos = p.collection.videos;
  const subTile = (v, n) => {
    const vslug = v.slug || slugify(v.title);
    const loopRel = `assets/loops/${p.slug}/${vslug}.mp4`;
    const loop = existsSync(join(root, loopRel));
    const thumb = v.image ? `../../${v.image}` : `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg`;
    const fallback = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
    const onerror = v.image ? '' : ` onerror="this.onerror=null;this.src='${fallback}'"`;
    return `      <li class="tile">
        <a href="https://www.youtube.com/watch?v=${esc(v.videoId)}" target="_blank" rel="noopener" data-cursor>
          <div class="frame">
            <img src="${esc(thumb)}" width="1280" height="720" alt=""${n < 2 ? '' : ' loading="lazy"'} decoding="async"${onerror}>${
      loop ? `\n            <video muted loop playsinline preload="none" tabindex="-1" aria-hidden="true" data-src="../../${esc(loopRel)}"></video>` : ''
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
    p.artist && ['Artist', p.artist],
    p.category && ['Type', p.category],
    p.role && ['Role', p.role],
    ['Watch on', 'YouTube'],
  ].filter(Boolean);
  const body = `<main id="main" class="project collection">
  <a class="back" href="../../#work">Back to work</a>
  <h1>${esc(p.title)}</h1>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
  </dl>
  <div class="collection-intro">
${p.collection.intro.map((t) => `    <p>${esc(t)}</p>`).join('\n')}
  </div>
  <ul class="grid">
${videos.map(subTile).join('\n')}
  </ul>
  <nav class="pager" aria-label="More projects">
    <a class="prev" href="../${esc(prev.slug)}/"><span>Previous</span><strong>${esc(prev.title)}</strong></a>
    <a class="next" href="../${esc(next.slug)}/"><span>Next</span><strong>${esc(next.title)}</strong></a>
  </nav>
</main>`;
  return shell({
    depth: 2,
    path: `work/${p.slug}/`,
    title: `${p.title}, ${p.artist} · ${site.name}`,
    description: p.collection.intro[0],
    image: p.image,
    body,
    bodyClass: 'page-project',
    current: 'work',
  });
}

function projectPage(p, i) {
  if (p.collection) return collectionPage(p, i);
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  const plat = PLATFORMS[p.platform] || { label: 'Web', embed: null };
  const embedUrl = plat.embed && p.videoId ? plat.embed(p.videoId) : '';
  const facts = [
    p.artist && [p.group === 'videoclip' ? 'Artist' : 'With', p.artist],
    p.category && ['Type', p.category],
    p.role && ['Role', p.role],
    ['Watch on', plat.label],
  ].filter(Boolean);

  const player = embedUrl
    ? `<div class="player" data-cursor data-embed="${esc(embedUrl)}" data-title="${esc(p.title)}">
      <img src="../../${esc(p.image)}" width="800" height="600" alt="Still from ${esc(p.title)}">
      <button type="button" class="player-btn" aria-label="Play ${esc(p.title)}"></button>
    </div>`
    : `<a class="player" data-cursor href="${esc(p.url)}" target="_blank" rel="noopener">
      <img src="../../${esc(p.image)}" width="800" height="600" alt="Still from ${esc(p.title)}">
      <span class="player-label">Watch on ${esc(plat.label)}</span>
    </a>`;

  const body = `<main id="main" class="project">
  <a class="back" href="../../#work">Back to work</a>
  <h1>${esc(p.title)}</h1>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
  </dl>
  ${player}
  <p class="external"><a href="${esc(p.url)}" target="_blank" rel="noopener">Open on ${esc(plat.label)}</a></p>
  <nav class="pager" aria-label="More projects">
    <a class="prev" href="../${esc(prev.slug)}/"><span>Previous</span><strong>${esc(prev.title)}</strong></a>
    <a class="next" href="../${esc(next.slug)}/"><span>Next</span><strong>${esc(next.title)}</strong></a>
  </nav>
</main>`;
  const who = p.artist ? `${p.title}, ${p.artist}` : p.title;
  return shell({
    depth: 2,
    path: `work/${p.slug}/`,
    title: `${who} · ${site.name}`,
    description: `${p.category || 'Project'}${p.artist ? ` with ${p.artist}` : ''}. ${p.role ? p.role + '. ' : ''}Work by ${site.name}.`,
    image: p.image,
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
    <img class="portrait" src="../${esc(a.photo)}" width="1690" height="1100" alt="${esc(a.photoAlt)}">
    <div class="about-text">
${a.body.map((t) => `      <p>${esc(t)}</p>`).join('\n')}
    </div>
  </div>
  <section class="services" aria-labelledby="services-title">
    <h2 id="services-title">How I work</h2>
    <div class="services-grid">
${site.services.map((s) => `      <article><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('\n')}
    </div>
  </section>
  <section class="clients" aria-labelledby="clients-title">
    <h2 id="clients-title">Companies I have worked with</h2>
    <ul>
${visibleClients
  .map(
    (c) =>
      `      <li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">` : ''}<img src="../${esc(c.logo)}" width="140" height="51" alt="${esc(c.name)}" loading="lazy">${c.url ? '</a>' : ''}</li>`
  )
  .join('\n')}
    </ul>
  </section>
</main>`;
  return shell({
    depth: 1,
    path: 'about/',
    title: `About · ${site.name}`,
    description: `${a.lead} ${site.name}, ${site.role.toLowerCase()} based in ${site.location}.`,
    image: a.photo,
    body,
    bodyClass: 'page-about',
    current: 'about',
  });
}

// ---------- contacto ----------
function contactPage() {
  const body = `<main id="main" class="contact">
  <h1>What are we making?</h1>
  <p class="contact-sub">Write to me and I\'ll reply as soon as I can.</p>
  <div class="contact-grid">
    <form id="contact-form" novalidate data-endpoint="${esc(site.contactEndpoint)}" data-email="${esc(site.email)}">
      <label for="name">Name</label>
      <input id="name" name="name" type="text" autocomplete="name" required>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <label for="message">Message</label>
      <textarea id="message" name="message" rows="7" required></textarea>
      <button type="submit">Send message</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
    <aside class="contact-side">
      <p>You can also write to me directly at</p>
      <p><a class="text-link" href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
      <p class="contact-place">${esc(site.location)}, Basque Country</p>
    </aside>
  </div>
</main>`;
  return shell({
    depth: 1,
    path: 'contact/',
    title: `Contact · ${site.name}`,
    description: `Get in touch with ${site.name}, ${site.role.toLowerCase()} based in ${site.location}.`,
    body,
    bodyClass: 'page-contact',
    cta: false,
    current: 'contact',
  });
}

// ---------- 404 ----------
function notFoundPage() {
  const body = `<main id="main" class="notfound">
  <h1>This page does not exist.</h1>
  <p><a class="text-link" href="/">Back to work</a></p>
</main>`;
  return shell({
    depth: 0,
    abs: true,
    path: '404.html',
    title: `Page not found · ${site.name}`,
    description: 'This page does not exist.',
    body,
    bodyClass: 'page-404',
    cta: false,
  });
}

// ---------- escribir ----------
write('index.html', homePage());
projects.forEach((p, i) => write(`work/${p.slug}/index.html`, projectPage(p, i)));
write('about/index.html', aboutPage());
write('contact/index.html', contactPage());
write('404.html', notFoundPage());

const urls = ['', 'about/', 'contact/', ...projects.map((p) => `work/${p.slug}/`)];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${site.url}/${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
write('.nojekyll', '');

const loops = projects.filter(hasLoop).length;
console.log(`OK: ${projects.length} proyectos publicados, ${loops} con bucle de vídeo, ${urls.length + 1} páginas.`);
