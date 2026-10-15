/* ============================================================
   校园集市 · 首页专用脚本

   只有 index.html 会引入这个文件。
   里面放的是“只有首页才有”的东西：

     1. 首屏搜索栏（标签切换 + 提交）
     2. 数据统计条的数字滚动

   商品列表、排序、收藏、筛选、发布那些属于“通用商品功能”，
   放在 goods.js 里，首页和二手交易页共用。
   ============================================================ */


/* ============================================================
   1. 基础自检
   ============================================================ */

// console.log() 会把内容输出到浏览器的控制台。
// 打开方式：在页面上按 F12（或右键 → 检查）→ 切换到 Console / 控制台 面板。
console.log('校园集市首页加载成功');


/* ============================================================
   2. 首屏搜索栏
   ============================================================ */

const searchTabs  = document.querySelectorAll('.search-tab');
const searchInput = document.querySelector('.search-input');
const searchCard  = document.querySelector('.search-card');

// querySelectorAll 返回的其实不是真正的数组，而是 NodeList。
// 它可以用 forEach 遍历，但不能用 map / filter 这些数组方法。
searchTabs.forEach(function (tab) {

    tab.addEventListener('click', function () {

        // ---------- 第一步：先把所有标签恢复成“未选中” ----------
        searchTabs.forEach(function (item) {
            item.classList.remove('is-active');

            // aria-pressed 是给读屏软件念的无障碍属性，
            // 它不影响页面外观，但必须和视觉效果保持同步，
            // 否则视障同学听到的状态和屏幕上看到的不一致。
            item.setAttribute('aria-pressed', 'false');
        });

        // ---------- 第二步：给当前被点的这个加上“选中” ----------
        tab.classList.add('is-active');
        tab.setAttribute('aria-pressed', 'true');

        // ---------- 第三步：更新输入框里的提示文字 ----------
        // dataset.placeholder 读的就是 HTML 里写的 data-placeholder 属性。
        // 这就是 data-* 自定义属性的用途：把“JS 要用、但页面上不显示”的数据
        // 直接挂在标签上，省得在 JS 里再写一遍 if / else 判断。
        searchInput.placeholder = tab.dataset.placeholder;

        // 顺手把光标放进输入框，用户可以直接开始打字
        searchInput.focus();
    });
});


/* ============================================================
   3. 提交搜索（真的去筛选商品）
   ============================================================ */

// 监听的是 <form> 的 submit 事件，而不是按钮的 click。
// 好处是：用户按回车键提交也能被捕获到，不用另外写键盘事件。
searchCard.addEventListener('submit', function (event) {

    // ★ 关键的一步：阻止表单的默认行为。
    // 表单默认提交会刷新整个页面（还会在网址后面拼上一串 ?xxx=yyy），
    // 这在单页应用里显然不是我们想要的，所以先把它拦下来。
    event.preventDefault();

    // .value 拿到输入框里的内容，.trim() 去掉首尾多余的空格
    const keyword = searchInput.value.trim();

    // 取出当前选中的标签，比如“搜商品”
    const activeTab = document.querySelector('.search-tab.is-active');
    const type = activeTab.dataset.tab;      // goods / errand / lost

    if (keyword === '') {
        // 空着按了回车，就当作“取消关键词筛选”。
        if (filters.keyword !== '') {
            filters.keyword = '';
            applyFilters();
        }
        searchInput.focus();
        return;              // return 会直接结束这个函数，后面的代码不再执行
    }

    // 跑腿和失物已经各自有独立的页面了，首页这个搜索框只管商品。
    // 与其让用户搜完什么都不发生，不如直接告诉他去哪儿。
    if (type !== 'goods') {
        const pageMap = { errand: 'errand.html', lost: 'lost.html' };
        showToast('「' + activeTab.textContent + '」请到对应页面搜索');

        // 顺手把用户送过去。延迟一下是为了让提示条先露个面。
        //
        // ★ 这个定时器必须能取消：
        //   用户要是在这 0.9 秒里自己点了别的页面，
        //   定时器照常触发会把他从想去的地方硬拽回来。
        const jumpTimer = setTimeout(function () {
            location.href = pageMap[type];
        }, 900);

        // pagehide 比 unload 可靠 —— 手机上切到后台也会触发
        window.addEventListener(pagehide, function () {
            clearTimeout(jumpTimer);
        }, { once: true });
        return;
    }

    // 把关键词塞进筛选条件，然后重新算一遍哪些卡片该显示
    filters.keyword = keyword;
    applyFilters();

    // 滚到商品列表，让用户马上看到结果
    document.getElementById('hot').scrollIntoView({ behavior: 'smooth' });
});


/* ============================================================
   4. 数据统计条：数字从 0 滚动到目标值
   ============================================================ */

const statNums = document.querySelectorAll('.stat-num');
const statsSection = document.querySelector('.stats');

// 如果页面里没有统计条，就跳过整段逻辑，避免报错
if (statsSection && statNums.length > 0) {

    // 记录动画是否已经播过。
    // 用户往下滚、又滚回来时会再次触发，不加这个开关数字会反复重播。
    let hasCounted = false;

    const countUp = function () {
        if (hasCounted) return;
        hasCounted = true;

        statNums.forEach(function (el) {
            // dataset 读到的永远是“字符串”，算数之前要先用 Number() 转成数字
            const target = Number(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            const duration = 1400;              // 动画总时长（毫秒）

            const startTime = performance.now();

            // requestAnimationFrame 会在浏览器每次重绘前调用一次这个函数，
            // 大约每秒 60 次。用它做动画比 setInterval 更流畅，
            // 而且页面切到后台时会自动暂停，不浪费性能。
            const tick = function (now) {

                // progress 是 0 → 1 的进度值，用 Math.min 卡在 1 以内
                const progress = Math.min((now - startTime) / duration, 1);

                // 缓动函数：easeOutCubic（先快后慢，最后稳稳停住）。
                // 不加缓动的话数字会匀速跳动，看起来很生硬。
                const eased = 1 - Math.pow(1 - progress, 3);

                const current = Math.round(target * eased);

                // toLocaleString() 会自动加千分位，12000 变成 "12,000"
                el.textContent = current.toLocaleString() + suffix;

                // 还没到 100% 就继续请求下一帧
                if (progress < 1) {
                    requestAnimationFrame(tick);
                }
            };

            requestAnimationFrame(tick);
        });
    };

    // 检查系统有没有开启“减少动态效果”。
    // 开了的话就不播动画，直接把最终数字填上去。
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
        statNums.forEach(function (el) {
            el.textContent = Number(el.dataset.target).toLocaleString() + (el.dataset.suffix || '');
        });

    } else {
        // IntersectionObserver 用来“观察元素有没有进入视口”。
        // 这样数字动画会在统计条滚到眼前时才播，而不是页面一打开就偷偷播完了。
        const observer = new IntersectionObserver(function (entries) {

            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    countUp();
                    // 播过一次就不再观察了，省性能
                    observer.unobserve(entry.target);
                }
            });

        // threshold: 0.4 表示“元素有 40% 露在视口里”才算进入
        }, { threshold: 0.4 });

        observer.observe(statsSection);
    }
}
