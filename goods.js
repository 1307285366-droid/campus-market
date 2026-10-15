/* ============================================================
   校园集市 · 商品模块

   首页（index.html）和二手交易页（goods.html）共用这一份代码：
   两边的商品卡片、排序、收藏、筛选、详情弹窗、发布表单，
   从结构到行为都是同一套。

   这个文件依赖 common.js 先加载（用到里面的 showToast、
   readStore、writeStore、makeId、formatTime）。
   ============================================================ */


/* ============================================================
   1. 商品卡片
   ============================================================ */

const goodsGrid = document.querySelector('.goods-grid');

// 每次要用的时候“现查一遍”，而不是页面一打开查一次就存起来。
// 因为用户可以发布新商品，新卡片是后来才插进网格的，
// 启动时存下的那份旧名单里不会有它。
const getGoodsCards = function () {
    // querySelectorAll 返回的 NodeList 没有 sort 方法，
    // 用 Array.from 转成真正的数组，后面才能直接排序。
    return Array.from(goodsGrid.querySelectorAll('.goods-card'));
};

// 把一条数据变成一张卡片。
// 这个函数有两个使用场景，所以单独抽出来：
//   1. 用户刚点“确认发布”时，立刻造一张卡片显示出来
//   2. 页面刷新后，把本地存的每条数据重新造成卡片
// 两个场景用同一套代码，就不会出现“刚发的和刷新后的长得不一样”。
const buildCard = function (item) {
    const card = document.createElement('article');
    card.className = 'goods-card';
    card.tabIndex = 0;                          // 键盘可以 Tab 到它
    card.setAttribute('aria-haspopup', 'dialog');

    // ★ 安全提醒：
    //   下面这段 innerHTML 里一个用户输入都没有，是纯骨架，所以是安全的。
    //   用户填的内容全部用 textContent 逐个赋值。
    //
    //   为什么不直接拼字符串？
    //   因为 textContent 永远按“纯文本”处理。
    //   哪怕有人把标题填成 <img src=x onerror=alert(1)>，
    //   页面也只会把这串字符原样显示出来，不会把它当 HTML 解析执行。
    //   直接拼进 innerHTML 就是一个 XSS 漏洞。
    card.innerHTML = `
        <div class="goods-thumb"></div>
        <span class="goods-tag"></span>
        <button type="button" class="fav-btn" aria-label="收藏" aria-pressed="false">♡</button>
        <div class="goods-body">
            <h3 class="goods-name"></h3>
            <p class="goods-meta"></p>
            <div class="goods-foot">
                <span class="goods-price"></span>
                <span class="goods-origin"></span>
            </div>
        </div>
    `;

    // 排序要用的数值挂在 data-* 上，规则和页面里写死的商品完全一致。
    // time 存的是“发布至今多少分钟”，数字越小越新，所以“最新发布”是升序排。
    const minutesAgo = Math.floor((Date.now() - item.createdAt) / 60000);

    card.dataset.id       = item.id;
    card.dataset.category = item.category;
    card.dataset.time     = String(minutesAgo);
    card.dataset.price    = String(item.price);
    card.dataset.hot      = '0';                  // 新发布的还没人看，人气是 0
    card.dataset.seller   = '我';
    card.dataset.desc     = item.desc;
    card.dataset.mine     = '1';                  // 标记“这是我发的”，弹窗据此决定显示哪些按钮

    card.querySelector('.goods-thumb').textContent = item.emoji;
    card.querySelector('.goods-name').textContent  = item.title;
    card.querySelector('.goods-meta').textContent  =
        item.category + ' · ' + item.college + ' · ' + formatTime(item.createdAt);
    card.querySelector('.goods-price').textContent = '¥' + item.price;

    const tagEl = card.querySelector('.goods-tag');
    tagEl.textContent = item.condition;
    // 成色是“全新”时用实心粉色标签，和列表里其他商品保持一致的规则
    tagEl.classList.toggle('goods-tag--new', item.condition === '全新');

    const originEl = card.querySelector('.goods-origin');
    if (item.origin) {
        // 填了原价就显示出来，它会自动带上删除线（样式写在 CSS 里）
        originEl.textContent = '¥' + item.origin;
    } else {
        // 没填就干脆把这个空 <span> 删掉，
        // 否则 flex 的 gap 会留下一个多余的缝隙，价格看起来偏右
        originEl.remove();
    }

    return card;
};


/* ============================================================
   2. 排序
   ============================================================ */

const sortBtns = document.querySelectorAll('.sort-btn');

// 用一张“查找表”把排序方式对应到比较函数上。
// 好处是以后想加一种排序，只要在这里添一行，
// 不用去改一串 if / else 分支。
//
// 比较函数的规则：返回负数 → a 排前面；返回正数 → b 排前面。
const sorters = {

    // data-time 存的是“几分钟前发布”，数字越小说明越新，所以升序排
    time:  (a, b) => Number(a.dataset.time)  - Number(b.dataset.time),

    // 价格从低到高，也是升序
    price: (a, b) => Number(a.dataset.price) - Number(b.dataset.price),

    // 人气从高到低，注意这里是 b 减 a，方向正好反过来
    hot:   (a, b) => Number(b.dataset.hot)   - Number(a.dataset.hot)
};

const sortGoods = function (key, animate) {
    const compare = sorters[key];
    if (!compare) return;      // 传进来一个不认识的键名，就什么都不做

    // animate 不传的时候默认是 true（播放落位动画）。
    // 只有页面加载时恢复历史数据会传 false —— 那会儿没必要再演一遍。
    if (animate === undefined) animate = true;

    // 注意：这里排序的是“元素本身的引用”，不是复制出来的副本，
    // 所以后面 appendChild 搬动它们时，动的就是页面上真正的那几个元素。
    const sorted = getGoodsCards().sort(compare);

    sorted.forEach(function (card, index) {

        // ★ appendChild 有个关键特性：如果这个元素已经在页面上了，
        //   它不会“复制一份”，而是把原来那个“搬”到新位置。
        //   所以循环调用 appendChild 就实现了原地重新排序。
        goodsGrid.appendChild(card);

        // 不需要动画的话，搬完位置就结束
        if (!animate) return;

        // 让卡片重新播一次入场动画，排序的变化才会被眼睛注意到。
        // 每张卡错开 40ms，形成依次落位的节奏。
        card.style.animationDelay = (index * 40) + 'ms';

        card.classList.remove('is-sorted');

        // 下面这行看起来毫无意义，其实是关键：
        // 浏览器会把连续的 JS 操作攒起来一起处理，
        // 如果 remove 完紧接着又 add，它会认为“类名从头到尾没变过”，动画不会重新触发。
        // 读一次 offsetWidth 会强制浏览器立刻重排一次，
        // 相当于逼它在 remove 和 add 之间“喘一口气”，动画才会从头播。
        void card.offsetWidth;

        card.classList.add('is-sorted');
    });
};

sortBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {

        // 先全部取消选中，再给当前这个加上
        sortBtns.forEach(function (b) {
            b.classList.remove('is-active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');

        sortGoods(btn.dataset.sort);
    });
});


/* ============================================================
   3. 收藏

   收藏存的是“商品 id 的数组”，不是整条商品数据。
   因为收藏只是一个“标记”，商品内容本身在页面或仓库里。
   两边各存一份的话，商品改了价格，收藏里那份就成了过期数据。
   ============================================================ */

const FAV_KEY = 'campus_market_favorites';

const loadFavorites = function () {
    // readArray 保证拿到的要么是数组、要么是空数组，
    // 后面直接 .includes / .filter 都不会炸
    return readArray(FAV_KEY);
};

const saveFavorites = function () {
    writeStore(FAV_KEY, favorites);
};

// 注意：这个变量要在下面的函数之前声明，
// 因为下面的函数会用到它（虽然真正调用发生在更晚）。
let favorites = loadFavorites();

const favCountEl   = document.getElementById('favCount');
const favFilterBtn = document.getElementById('favFilterBtn');

const updateFavCount = function () {
    if (favCountEl) favCountEl.textContent = favorites.length;
};

// 把收藏状态“画”到卡片上。
// 单独抽成函数，是因为有好几个时机都要重画一遍：
// 页面刚打开、用户点了心形、卡片被编辑后重建……写一遍就够了。
const renderFavorites = function () {
    getGoodsCards().forEach(function (card) {
        const btn = card.querySelector('.fav-btn');
        if (!btn) return;

        const active = favorites.includes(card.dataset.id);

        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
        btn.textContent = active ? '♥' : '♡';

        // 让读屏软件念出当前状态是“收藏”还是“取消收藏”
        btn.setAttribute('aria-label', active ? '取消收藏' : '收藏');
    });
};

// 切换某个商品的收藏状态。
//
// ★ 拆成「按 id」的版本，是因为有两个入口都要调它：
//   卡片右上角那个小心形，和商品详情弹窗底部那个收藏按钮。
//   两个入口各写一遍切换逻辑的话，迟早会有一边漏掉某个步骤。
const toggleFavoriteById = function (id) {
    if (favorites.includes(id)) {
        // 已经收藏了 → 取消。
        // filter 返回“所有不等于这个 id 的项”，也就是把它剔除后的新数组。
        favorites = favorites.filter(function (f) { return f !== id; });
        showToast('已取消收藏');
    } else {
        favorites.push(id);
        showToast('已加入收藏');
    }

    saveFavorites();
    renderFavorites();
    updateFavCount();
    syncModalCollect();          // 弹窗里那个按钮的文字也要跟着变

    // 如果此刻正开着“只看收藏”，取消收藏后这张卡应该马上从列表里消失
    if (filters.onlyFav) applyFilters();
};

// 卡片上的小心形点进来了
const toggleFavorite = function (btn) {
    toggleFavoriteById(btn.closest('.goods-card').dataset.id);
};


/* ============================================================
   4. 筛选（关键词 + 分类 + 只看收藏）
   ============================================================ */

// 把当前的筛选条件集中放在一个对象里。
// 好处是各处只要改这个对象、再调一次 applyFilters() 就行，
// 不用在每处都写一遍“如果关键词是空、而且没开收藏筛选……”这种判断。
const filters = {
    keyword:  '',      // 搜索关键词，空字符串表示没在搜
    category: 'all',   // 商品分类，'all' 表示全部
    onlyFav:  false    // 是否只看收藏
};

const filterTip     = document.getElementById('filterTip');
const filterTipText = document.getElementById('filterTipText');
const emptyState    = document.getElementById('emptyState');

// 按当前条件，决定每张卡片显示还是隐藏
const applyFilters = function () {
    const keyword = filters.keyword.trim().toLowerCase();
    let visibleCount = 0;

    getGoodsCards().forEach(function (card) {
        // 条件一：标题里包含关键词（没填关键词时全部算命中）
        const name = card.querySelector('.goods-name').textContent.toLowerCase();
        const hitKeyword = keyword === '' || name.includes(keyword);

        // 条件二：分类（'all' 表示不限）
        const hitCategory = filters.category === 'all'
                         || card.dataset.category === filters.category;

        // 条件三：是否只看收藏
        const hitFav = !filters.onlyFav || favorites.includes(card.dataset.id);

        // 三个条件是“并且”的关系：都满足才显示
        const show = hitKeyword && hitCategory && hitFav;

        // hidden 是 HTML 自带的隐藏开关，用它比来回改 class 干净
        card.hidden = !show;

        if (show) visibleCount++;
    });

    /* ---------- 更新筛选提示条 ---------- */
    const filtering = keyword !== ''
                   || filters.category !== 'all'
                   || filters.onlyFav;

    if (filterTip) {
        filterTip.hidden = !filtering;

        if (filtering) {
            // 把生效的条件拼成一句话，比如“关键词「球拍」 + 只看收藏 · 找到 1 件”
            const parts = [];
            if (keyword !== '')          parts.push('关键词「' + filters.keyword.trim() + '」');
            if (filters.category !== 'all') parts.push('分类：' + filters.category);
            if (filters.onlyFav)         parts.push('只看收藏');

            filterTipText.textContent = parts.join(' + ') + ' · 找到 ' + visibleCount + ' 件';
        }
    }

    /* ---------- 一件都没剩，就把空状态顶上来 ---------- */
    if (emptyState) emptyState.hidden = visibleCount !== 0;

    // 顺便把结果数量回填到页面上的计数器（二手交易页有，首页没有）
    const countEl = document.getElementById('resultCount');
    if (countEl) countEl.textContent = visibleCount;
};

// 清空所有筛选条件，同时把界面上的开关也一起复位。
// 注意“改状态”和“改界面”必须成对出现，
// 只改一边就会出现“数据说没筛选、界面还亮着”的错位。
const clearFilters = function () {
    filters.keyword  = '';
    filters.category = 'all';
    filters.onlyFav  = false;

    const searchInputEl = document.querySelector('.search-input');
    if (searchInputEl) searchInputEl.value = '';

    if (favFilterBtn) {
        favFilterBtn.classList.remove('is-active');
        favFilterBtn.setAttribute('aria-pressed', 'false');
    }

    // 分类标签也恢复成“全部”
    document.querySelectorAll('.chip[data-category]').forEach(function (chip) {
        const isAll = chip.dataset.category === 'all';
        chip.classList.toggle('is-active', isAll);
        chip.setAttribute('aria-pressed', String(isAll));
    });

    applyFilters();
};

// “只看收藏”开关
if (favFilterBtn) {
    favFilterBtn.addEventListener('click', function () {
        filters.onlyFav = !filters.onlyFav;

        favFilterBtn.classList.toggle('is-active', filters.onlyFav);
        favFilterBtn.setAttribute('aria-pressed', String(filters.onlyFav));

        applyFilters();
    });
}

// 分类标签（只有二手交易页有，首页没有，所以先查一下存不存在）
const categoryChips = document.querySelectorAll('.chip[data-category]');

categoryChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
        filters.category = chip.dataset.category;

        categoryChips.forEach(function (c) {
            const active = c === chip;
            c.classList.toggle('is-active', active);
            c.setAttribute('aria-pressed', String(active));
        });

        applyFilters();
    });
});

// 提示条上的“清除筛选”和空状态里的“查看全部商品”，干的其实是同一件事
const filterClearBtn = document.getElementById('filterClearBtn');
const emptyResetBtn  = document.getElementById('emptyResetBtn');

if (filterClearBtn) filterClearBtn.addEventListener('click', clearFilters);
if (emptyResetBtn)  emptyResetBtn.addEventListener('click', clearFilters);

/* ------------------------------------------------------------
   4.1 列表页自带的搜索框

   首页那个搜索框在 Hero 里，带类型标签、要按回车才生效，
   它承担的是“把用户从首页带到对应板块”。
   这个是列表页上的筛选工具，边打字边过滤，用 input 事件而不是 submit。

   （首页没有这个元素，所以先判断存不存在。）
   ------------------------------------------------------------ */
const goodsSearchInput = document.getElementById('goodsSearch');

if (goodsSearchInput) {
    goodsSearchInput.addEventListener('input', function () {
        filters.keyword = goodsSearchInput.value.trim();
        applyFilters();
    });
}


/* ============================================================
   5. 商品详情弹窗
   ============================================================ */

const goodsModal = document.getElementById('goodsModal');

// 在弹窗内部用 querySelector 找子元素，而不是继续从 document 找。
// 好处是搜索范围被限制在这棵子树里，不会误抓到页面上同名的其他元素。
const modalThumb  = goodsModal.querySelector('.modal-thumb');
const modalTag    = goodsModal.querySelector('.goods-tag');
const modalTitle  = goodsModal.querySelector('.modal-title');
const modalMeta   = goodsModal.querySelector('.modal-meta');
const modalPrice  = goodsModal.querySelector('.modal-price-now');
const modalOrigin = goodsModal.querySelector('.modal-price-origin');
const modalDesc   = goodsModal.querySelector('.modal-desc');

// 底部四个操作按钮。
// 注意这里是用 data-role 去取的，而不是用样式类名（比如 .modal-btn--danger）。
// 类名是给 CSS 用的，以后调样式改了类名，JS 就跟着找不到元素了；
// data-* 专门当 JS 的钩子，两边互不干扰。
const modalActions  = goodsModal.querySelector('.modal-actions');
const actionCollect = modalActions.querySelector('[data-role="collect"]');
const actionContact = modalActions.querySelector('[data-role="contact"]');
const actionEdit    = modalActions.querySelector('[data-role="edit"]');
const actionDelete  = modalActions.querySelector('[data-role="delete"]');

// 记住弹窗此刻展示的是哪张卡片。
// 编辑、撤回这些按钮需要知道“操作的是哪一条”，
// 但它们的事件回调里拿不到卡片，所以在打开弹窗时先记下来。
let currentCard = null;

// 让弹窗底部那个收藏按钮和真实状态保持一致。
//
// 抽成函数是因为有两个时机要同步：
//   打开弹窗时（要反映这件商品有没有被收藏过），
//   以及点击切换后（文字和图标要立刻变）。
const syncModalCollect = function () {
    if (!currentCard) return;

    const active = favorites.includes(currentCard.dataset.id);

    actionCollect.classList.toggle('is-fav', active);
    actionCollect.setAttribute('aria-pressed', String(active));
    actionCollect.textContent = active ? '♥ 已收藏' : '♡ 收藏';
};

// ★ 这个按钮之前是个死按钮：元素取出来了、也控制了显示隐藏，
//   但从头到尾没有绑过任何事件 —— 点了什么都不发生。
//   卡片上的小心形是好的，只有弹窗里这个漏了，很容易被忽略：
//   因为它看起来完全正常，只是没反应。
actionCollect.addEventListener('click', function () {
    if (!currentCard) return;
    toggleFavoriteById(currentCard.dataset.id);
});

// 打开弹窗：把卡片上的内容“搬”进弹窗里
const openModal = function (card) {

    // 卡片上已经看得见的信息，直接从 DOM 里读出来，
    // 不用在 HTML 里把同样的文字再写一遍（否则以后改一处就会漏一处）
    modalThumb.textContent  = card.querySelector('.goods-thumb').textContent;
    modalTag.textContent    = card.querySelector('.goods-tag').textContent;
    modalTitle.textContent  = card.querySelector('.goods-name').textContent;
    modalMeta.textContent   = card.querySelector('.goods-meta').textContent
                              + ' · 卖家 ' + card.dataset.seller;
    modalPrice.textContent  = card.querySelector('.goods-price').textContent;
    modalOrigin.textContent = card.querySelector('.goods-origin')
                            ? card.querySelector('.goods-origin').textContent
                            : '';

    // 卡片上没显示、只在弹窗里出现的描述文字，存在 data-desc 里
    modalDesc.textContent = card.dataset.desc;

    // 如果是“全新”商品，弹窗里的标签也要换成实心粉色那一版。
    // classList.toggle(类名, 布尔值)：第二个参数为 true 就加上、false 就移除。
    const isNew = card.querySelector('.goods-tag').classList.contains('goods-tag--new');
    modalTag.classList.toggle('goods-tag--new', isNew);

    // 按“是不是自己发的”切换底部按钮：
    //   别人的商品 → 收藏 / 联系卖家
    //   自己的商品 → 编辑 / 撤回发布
    // data-mine 是 buildCard 里给用户发布的卡片打的标记。
    // 页面里写死的那些商品没有这个属性，读到的是 undefined，所以算“别人的”。
    const isMine = Boolean(card.dataset.mine);

    actionCollect.hidden = isMine;
    actionContact.hidden = isMine;
    actionEdit.hidden    = !isMine;
    actionDelete.hidden  = !isMine;

    // 记下当前卡片，编辑、撤回、收藏都要用
    currentCard = card;

    // 收藏按钮得反映真实状态 —— 否则已经收藏过的商品，
    // 打开详情还是显示“♡ 收藏”，用户会以为没收藏上。
    syncModalCollect();

    // showModal() 是 <dialog> 的原生方法。
    // 它会自动把弹窗放到最上层、锁住键盘焦点、接管 Esc 键。
    goodsModal.showModal();

    // 锁住背景滚动（对应 CSS 里的 html.is-modal-open）
    lockScroll();
};

// 关闭弹窗。
// 注意这里只负责“关”，清理状态的工作交给下面的 close 事件——
// 因为用户按 Esc 键时浏览器会自己把弹窗关掉，那条路径不经过这个函数。
const closeModal = function () {
    goodsModal.close();
};

// 给卡片绑上打开弹窗的事件。
//
// ★ 这里没有给每张卡片单独绑，而是把事件绑在它们的父容器 .goods-grid 上。
//   这个技巧叫“事件委托”。
//
//   原理：事件触发后会从被点击的元素开始，一层层向外“冒泡”到父元素。
//        所以我们在父元素上接住它，再回头判断“到底是哪张卡片被点了”。
//
//   好处：后来用 JS 新插进网格的卡片，不用再单独绑一次，自动就能点开。
//        如果按老写法在页面打开时 forEach 绑一遍，
//        用户自己发布的商品是点不动的——因为它当时还不存在。
goodsGrid.addEventListener('click', function (event) {

    // ★ 先判断是不是点了收藏按钮。
    //   收藏按钮就在卡片内部，点它同样会冒泡到这里。
    //   不先拦住的话，就会变成“收藏的同时又弹出了详情弹窗”。
    const favBtn = event.target.closest('.fav-btn');
    if (favBtn) {
        toggleFavorite(favBtn);
        return;
    }

    // closest() 从被点击的元素开始往上找，返回最近的 .goods-card。
    // 点在卡片里的文字或 emoji 上时，也能正确找到整张卡片。
    const card = event.target.closest('.goods-card');

    if (card) openModal(card);
});

// 键盘打开走同一套委托。
// 卡片是 <article>，本身不是按钮、不能被 Tab 键选中，
// 所以 HTML 上给它加了 tabindex="0"，这里再手动处理回车和空格键。
goodsGrid.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    // 焦点停在收藏按钮上时，回车/空格应该交给浏览器，
    // 由它给按钮触发一次 click（然后上面的委托会处理收藏）。
    // 这里必须放行，否则会“按一下回车：收藏了，弹窗也开了”。
    if (event.target.closest('.fav-btn')) return;

    const card = event.target.closest('.goods-card');
    if (!card) return;

    event.preventDefault();   // 空格键默认会让页面往下滚，必须拦掉
    openModal(card);
});

// 点右上角的 × 关闭
goodsModal.querySelector('.modal-close').addEventListener('click', closeModal);

// 点弹窗外的遮罩也能关。
// 判断原理：点遮罩空白处时，事件的目标就是 <dialog> 本身；
// 点弹窗内部时，目标会是内部的某个子元素。
// 所以 event.target === goodsModal 就能区分“点外面”和“点里面”。
goodsModal.addEventListener('click', function (event) {
    if (event.target === goodsModal) {
        closeModal();
    }
});

// ---------- 撤回自己发布的商品 ----------
actionDelete.addEventListener('click', function () {
    if (!currentCard) return;

    // 先记住编号，因为下面马上就要把 currentCard 置空了
    const id = currentCard.dataset.id;

    // 1. 从页面上移除
    currentCard.remove();

    // 2. 从本地仓库里也删掉。
    //    ★ 这一步千万不能漏。
    //      只删页面上的卡片的话，刷新一下它就从 localStorage 里又冒出来了，
    //      用户会觉得“删了没用”——这类 bug 非常常见。
    saveMyGoods(loadMyGoods().filter(function (item) {
        return item.id !== id;
    }));

    // 3. 如果它被收藏过，也要从收藏里清掉。
    //    否则收藏列表里会留下一个永远点不到的“幽灵编号”，
    //    还会把收藏数量的角标撑大。
    if (favorites.includes(id)) {
        favorites = favorites.filter(function (f) { return f !== id; });
        saveFavorites();
        updateFavCount();
    }

    currentCard = null;
    closeModal();
    applyFilters();          // 重算筛选，顺便更新“找到 N 件”

    showToast('已撤回发布');
});

// ---------- 编辑自己发布的商品 ----------
actionEdit.addEventListener('click', function () {
    if (!currentCard) return;

    // 从本地仓库里找出这条数据的完整内容。
    //
    // ★ 注意是“从仓库里读”，不是“从卡片上读”。
    //   卡片上只有标题、价格这些看得见的信息；
    //   分类、学院要么没显示，要么被拼进了 meta 那一行字符串里。
    //   仓库里存的那份数据才是完整、干净的 ——
    //   这正是当初决定“存数据而不是存 HTML”换来的好处。
    const item = loadMyGoods().find(function (i) {
        return i.id === currentCard.dataset.id;
    });

    if (!item) {
        // 理论上不会走到这里（只有自己发的商品才有编辑按钮）。
        // 但万一用户手动清过 localStorage，这里兜一下，别让脚本崩掉。
        showToast('找不到这条数据了');
        return;
    }

    closeModal();          // 先关掉详情弹窗
    openEditModal(item);   // 再打开填好内容的编辑表单
});

// ---------- 联系卖家：弹出私信界面 ----------
actionContact.addEventListener('click', function () {
    if (!currentCard) return;

    const seller = currentCard.dataset.seller;
    const title  = currentCard.querySelector('.goods-name').textContent;

    // 先关掉商品详情，再开私信。
    // 不关的话两个 <dialog> 会一起待在最上层，
    // 用户按 Esc 只会关掉上面那一个，看起来像“关不干净”。
    closeModal();

    // openChat 定义在 chat.js 里。
    // 这两个文件共享同一个全局作用域，所以这里可以直接调它 ——
    // 前提是页面按顺序引入了 common.js → chat.js → goods.js。
    //
    // 四个参数：对方名字、聊的是哪件商品、预填的草稿、场景。
    // 场景决定用哪一套招呼语、快捷短语和自动回复。
    openChat(seller, title, '你好，请问「' + title + '」还在吗？', 'goods');
});

// 不管是点 ×、点遮罩、还是按 Esc 关掉的，
// 最后都会触发这个 close 事件。把收尾统一放在这里最保险。
goodsModal.addEventListener('close', function () {
    unlockScroll();
});


/* ============================================================
   6. 发布 / 编辑商品（含本地持久化）
   ============================================================ */

const publishBtn   = document.getElementById('publishBtn');
const publishModal = document.getElementById('publishModal');
const publishForm  = document.getElementById('publishForm');
const emojiOpts    = publishModal.querySelectorAll('.emoji-opt');

// 记住用户当前挑的封面图标
let pickedEmoji = '📦';

const GOODS_KEY = 'campus_market_my_goods';

const loadMyGoods = function () {
    return readArray(GOODS_KEY);
};

const saveMyGoods = function (list) {
    writeStore(GOODS_KEY, list);
};

/* ------------------------------------------------------------
   6.1 老数据的分类名迁移

   分类改过一次名：「酒水」→「酒水饮品」、「茶叶」→「茶叶干货」，
   还取消了一个「其他」。
   但用户早就发布在浏览器本地的那几条，分类字段还停留在旧值 ——
   不处理的话，点任何标签都筛不出来，只有「全部」能看见它们。

   这里在页面打开时读一遍，把旧名字换掉再存回去。

   ★ 只处理「确定改过名」的那三个。
     认不出来的值一律原样不动 —— 宁可让它筛不出来，
     也不能把一条好好的数据改成错的分类。
   ------------------------------------------------------------ */
const CATEGORY_FIXES = {
    '酒水': '酒水饮品',
    '茶叶': '茶叶干货',
    '其他': '生活百货'
};

const migrateCategories = function () {
    const list = loadMyGoods();
    let fixed = 0;

    list.forEach(function (item) {
        const next = CATEGORY_FIXES[item.category];
        if (next) {
            item.category = next;
            fixed++;
        }
    });

    if (fixed > 0) {
        saveMyGoods(list);
        console.log('已把 ' + fixed + ' 条本地商品的旧分类名更新成新的');
    }
};

/* ------------------------------------------------------------
   6.1 选封面图标
   ------------------------------------------------------------ */
emojiOpts.forEach(function (opt) {
    opt.addEventListener('click', function () {

        // 先全部取消选中，再给当前这个加上
        emojiOpts.forEach(function (o) {
            o.classList.remove('is-active');
            o.setAttribute('aria-pressed', 'false');
        });
        opt.classList.add('is-active');
        opt.setAttribute('aria-pressed', 'true');

        // textContent 就是按钮里那个 emoji 字符本身
        pickedEmoji = opt.textContent.trim();
    });
});

// 把图标选择器恢复成“选中第一个”的初始状态
const resetEmojiPicker = function () {
    emojiOpts.forEach(function (o, index) {
        const isFirst = index === 0;
        o.classList.toggle('is-active', isFirst);
        o.setAttribute('aria-pressed', isFirst ? 'true' : 'false');
    });
    pickedEmoji = emojiOpts[0].textContent.trim();
};

/* ------------------------------------------------------------
   6.2 打开 / 关闭弹窗
   ------------------------------------------------------------ */

// 弹窗顶部的标题、说明和提交按钮的文字，发布和编辑要显示不同内容
const publishTitleEl = publishModal.querySelector('.publish-title');
const publishSubEl   = publishModal.querySelector('.publish-sub');
const publishSubmit  = publishForm.querySelector('[type="submit"]');

// 当前正在编辑哪一条。
//   null  → 发布新的
//   有值  → 在改已有编号的那一条
let editingId = null;

// ---------- 打开：发布一件新的 ----------
const openPublishModal = function () {
    editingId = null;

    publishForm.reset();      // 清空所有输入，避免看到上一次填的残留
    resetEmojiPicker();

    publishTitleEl.textContent = '发布闲置';
    publishSubEl.textContent   = '填好下面的信息，30 秒就能挂上架';
    publishSubmit.textContent  = '确认发布';

    publishModal.showModal();
    lockScroll();
};

// ---------- 打开：编辑已有的一件 ----------
const openEditModal = function (item) {
    editingId = item.id;

    // 把这条数据的每个字段填回表单。
    // 对 <input> 和 <select> 来说，直接给 .value 赋值就行。
    // <select> 会去找 value 相同的那个 <option>；
    // 咱们的成色、学院选项没写 value 属性，这种情况下
    // 选项的 value 就等于它的文字（比如“九成新”），所以照样能对上。
    document.getElementById('pubTitle').value     = item.title;
    document.getElementById('pubCategory').value  = item.category;
    document.getElementById('pubCondition').value = item.condition;
    document.getElementById('pubPrice').value     = item.price;
    document.getElementById('pubOrigin').value    = item.origin;
    document.getElementById('pubDesc').value      = item.desc;
    document.getElementById('pubCollege').value   = item.college;

    // 图标选择器不是表单控件，form.reset() 管不到它，得手动还原
    pickedEmoji = item.emoji;
    emojiOpts.forEach(function (o) {
        const active = o.textContent.trim() === item.emoji;
        o.classList.toggle('is-active', active);
        o.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    publishTitleEl.textContent = '编辑商品';
    publishSubEl.textContent   = '改完点保存，列表里会立刻更新';
    publishSubmit.textContent  = '保存修改';

    publishModal.showModal();
    lockScroll();
};

// 悬浮按钮打开的是“发布新的”。
// 这里直接把函数名传给 addEventListener，没有包一层匿名函数 ——
// 因为我们的函数不需要用到事件对象，包一层是多余的。
publishBtn.addEventListener('click', openPublishModal);

publishModal.addEventListener('close', function () {
    unlockScroll();
});

publishModal.querySelector('.modal-close').addEventListener('click', function () {
    publishModal.close();
});

publishForm.querySelector('[data-close]').addEventListener('click', function () {
    publishModal.close();
});

// 点遮罩关闭
publishModal.addEventListener('click', function (event) {
    if (event.target === publishModal) publishModal.close();
});

/* ------------------------------------------------------------
   6.3 表单校验
   ------------------------------------------------------------ */

// clearErrorOnInput / checkRequired / focusFirstError 三个校验工具
// 放在 common.js 里，因为发布跑腿任务、发布失物信息也要用同样的一套。
clearErrorOnInput(publishForm);

/* ------------------------------------------------------------
   6.4 提交
   ------------------------------------------------------------ */
publishForm.addEventListener('submit', function (event) {

    // 拦掉表单默认的“刷新整页”行为
    event.preventDefault();

    const titleInput = document.getElementById('pubTitle');
    const priceInput = document.getElementById('pubPrice');
    const descInput  = document.getElementById('pubDesc');

    const title = titleInput.value.trim();
    const price = Number(priceInput.value);
    const desc  = descInput.value.trim();

    // 三个必填项一起检查，而不是碰到第一个错就 return。
    // 那样用户得填一次、提交一次，反复试错；
    // 一次性把所有问题都标出来，一眼就能看全。
    const okTitle = checkRequired(titleInput);
    const okDesc  = checkRequired(descInput);

    // 价格除了不能空，还得是个大于 0 的数，所以要单独判断
    const okPrice = priceInput.value.trim() !== '' && price > 0;
    priceInput.closest('.field').classList.toggle('has-error', !okPrice);

    if (!okTitle || !okPrice || !okDesc) {
        focusFirstError(publishForm);   // 把光标送到第一个出错的地方
        return;                         // 结束，不往下走了
    }

    /* ---------- 把这次填写的内容整理成一条数据 ---------- */

    const category  = document.getElementById('pubCategory').value;
    const condition = document.getElementById('pubCondition').value;
    const college   = document.getElementById('pubCollege').value;
    const origin    = document.getElementById('pubOrigin').value.trim();

    // ★ 这里是整个持久化的关键：要存的是“数据”，不是卡片的 HTML 字符串。
    //
    //   为什么不直接存卡片那段 HTML？
    //     1. 以后卡片样式一改，仓库里存着的旧 HTML 就全成了对不上号的垃圾
    //     2. 想把商品换成一行文字列表展示，存的 HTML 等于全部作废
    //   数据才是“事实”，HTML 只是它的一种展示方式。
    //
    //   注意这里没有 id 和 createdAt：
    //   它们是“这条记录自身”的属性，不属于用户在表单里填的内容，
    //   所以在下面两条路里分别处理。
    const fields = {
        emoji:     pickedEmoji,
        title:     title,
        category:  category,
        condition: condition,
        price:     price,
        origin:    origin,          // 可能是空字符串，buildCard 里会判断
        college:   college,
        desc:      desc
    };

    /* ============================================================
       分两条路走：改已有的 / 新建一条
       ============================================================ */

    if (editingId) {

        /* ---------- 路线一：编辑 ---------- */

        const list = loadMyGoods();
        const index = list.findIndex(function (i) {
            return i.id === editingId;
        });

        if (index !== -1) {
            // Object.assign 把 fields 里的字段“盖”到原来的数据上，
            // 返回的是一份新对象，原对象不受影响。
            //
            // ★ id 和 createdAt 都不在 fields 里，所以它们被原样保留。
            //   这是故意的：改一下价格不该让商品变成“刚刚发布”，
            //   否则用户随便改个错别字，就能反复把自己刷到列表最前面。
            const updated = Object.assign({}, list[index], fields);

            list[index] = updated;
            saveMyGoods(list);

            // 页面上的卡片整张换掉，而不是在原地逐个改文字。
            // 新卡同样由 buildCard 造，就不会出现“编辑过的卡片长得和别的不一样”。
            // ★ 用 find 而不要把 id 拼进选择器字符串：
            //   万一 id 里带了引号或方括号（存储被手动改过就可能），
            //   querySelector 会当场抛 SyntaxError，保存静默失败 ——
            //   数据写进库了、卡片却没更新，两个视图对不上。
            const oldCard = getGoodsCards().find(function (c) {
                return c.dataset.id === editingId;
            });
            if (oldCard) oldCard.replaceWith(buildCard(updated));

            // 新卡片是全新的 DOM，心形会回到默认的未收藏状态。
            // 如果这件商品本来就被收藏着，得重画一次，否则心形会莫名变空。
            renderFavorites();

            // ★ 按【当前生效的那个排序】重排，而不是硬切回“最新发布”。
            //   硬切会出现一种很难查的错位：列表顺序确实变了，
            //   但排序按钮还亮着「价格最低」—— 用户看到的是“列表自己乱了”。
            const activeSort = document.querySelector('.sort-btn.is-active');
            sortGoods(activeSort ? activeSort.dataset.sort : 'time');

            // 标题可能改过了，之前命中的搜索结果现在也许不再命中，重算一遍
            applyFilters();

            showToast('修改已保存');
        }

    } else {

        /* ---------- 路线二：新建 ---------- */

        // id 和 createdAt 在这里补上
        const item = Object.assign({ id: makeId(), createdAt: Date.now() }, fields);

        // 存进本地仓库。
        // unshift 是把新数据放到数组开头，这样它天然就是最新的一条。
        const myGoods = loadMyGoods();
        myGoods.unshift(item);
        saveMyGoods(myGoods);

        const card = buildCard(item);

        goodsGrid.prepend(card);    // 先插到最前面

        // 自动切回“最新发布”排序。
        // 因为新商品的初始人气是 0，
        // 如果当前正好停在“人气最高”，它会被排到最后一个，
        // 用户根本看不到自己刚发的东西。
        sortBtns.forEach(function (b) {
            b.classList.remove('is-active');
            b.setAttribute('aria-pressed', 'false');
        });
        const timeBtn = document.querySelector('.sort-btn[data-sort="time"]');
        if (timeBtn) {
            timeBtn.classList.add('is-active');
            timeBtn.setAttribute('aria-pressed', 'true');
        }
        sortGoods('time');

        // 先把筛选清掉。
        // 否则如果用户此刻正搜着“球鞋”，刚发布的“羽毛球拍”会被搜索条件挡掉，
        // 下面这行滚动就会滚到一张看不见的卡片上，用户一脸茫然。
        clearFilters();

        // 滚动到新卡片并把它放到屏幕中间，让用户立刻看到自己的成果
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        console.log('已发布：' + title + ' · ¥' + price + ' · ' + category);
        showToast('发布成功，已上架');
    }

    /* ---------- 收尾（两条路都要做） ---------- */

    editingId = null;            // 重置，免得下次打开发布弹窗时走错分支
    publishModal.close();
    publishForm.reset();         // 清空表单，下次打开是干净的
    resetEmojiPicker();          // reset() 管不到图标选择器，得手动还原
});


/* ============================================================
   7. 页面打开时的初始化
   ============================================================ */

// 1) 把已有的收藏状态画到卡片上
renderFavorites();
updateFavCount();

// 2) 先把老数据里的分类名修一遍，再把上次发布的商品恢复出来。
//    顺序不能反 —— 反了的话，卡片会先按旧分类造出来，
//    等改完数据界面又不会自己刷新，两边就对不上了。
migrateCategories();

const savedGoods = loadMyGoods();

if (savedGoods.length > 0) {

    savedGoods.forEach(function (item) {
        goodsGrid.appendChild(buildCard(item));
    });

    // 第二个参数传 false：这次不用播落位动画。
    // 页面刚打开，用户还没做任何操作，一堆卡片各自闪一下只会显得乱。
    sortGoods('time', false);

    // ★ 必须再画一次收藏状态。
    //   上面那次 renderFavorites() 是在这些卡片被创建之前跑的，
    //   当时它们还不存在，自然轮不到它们。
    renderFavorites();

    console.log('已从本地恢复 ' + savedGoods.length + ' 件我发布的商品');
}

// 3) 如果这个页面有分类标签，先让它显示“找到 N 件”
if (document.getElementById('resultCount')) {
    applyFilters();
}
