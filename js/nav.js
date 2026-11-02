// The one place the site header is defined. Each page loads this script straight
// after its <header id="site-header">, so the header appears without a layout jump.
(function () {
  const LINKS = [
    { href: 'index.html', label: '홈' },
    { href: 'main.html', label: '오늘의 코디' },
    { href: 'closet.html', label: '옷장' },
    { href: 'add.html', label: '옷 추가' },
    { href: 'history.html', label: '기록' },
  ];

  const header = document.getElementById('site-header');
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  const items = LINKS.map(({ href, label }) => {
    const current = href === currentPage ? ' aria-current="page"' : '';
    return `<li><a href="${href}"${current}>${label}</a></li>`;
  }).join('');

  header.innerHTML = `
    <div class="site-header__inner">
      <a class="site-header__brand" href="index.html">오늘 뭐 입지?</a>
      <nav aria-label="주요 메뉴">
        <ul class="site-nav">${items}</ul>
      </nav>
    </div>`;
})();
