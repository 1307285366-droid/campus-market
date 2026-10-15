/* ============================================================
   校园集市 · 失物招领页

   这一页要做四件事：
     1. 在“寻物 / 招领”之间切换（其实就是一个筛选）
     2. 发布失物信息（存进本地，刷新后还在）
     3. 认领 / 提供线索（演示用，没有后端）
     4. 撤回自己发布的信息

   依赖 common.js（提示条、本地存储、表单校验工具）
   和 chat.js（认领 / 提供线索时弹出的私信界面）。
   ============================================================ */


/* ============================================================
   1. 元素引用
   ============================================================ */

const lostList    = document.getElementById('lostList');
const lostCountEl = document.getElementById('resultCount');
const lostEmpty   = document.getElementById('emptyState');

const publishBtn   = document.getElementById('publishBtn');
const publishModal = document.getElementById('publishModal');
const publishForm  = document.getElementById('publishForm');

const LOST_KEY = 'campus_market_my_lost';

// ★ 注意这里的选择器范围。
//   页面的筛选标签和发布表单里的“类型选择”用的是同一个 data-kind 属性，
//   如果直接写 .chip[data-kind] 会把表单里那两个也选进来，
//   于是点页面的筛选会连带影响表单。
//   加个 .page-main 前缀限定范围 —— 弹窗在 <main> 外面，就不会被选中。
const lostChips = document.querySelectorAll('.page-main .chip[data-kind]');

// 当前筛选的类型，'all' 表示不筛
let currentKind = 'all';


/* ============================================================
   2. 按类型筛选
   ============================================================ */

const getLostItems = function () {
    return Array.from(lostList.querySelectorAll('.list-card'));
};

const applyKindFilter = function () {
    let visible = 0;

    getLostItems().forEach(function (card) {
        const show = currentKind === 'all' || card.dataset.kind === currentKind;

        card.hidden = !show;
        if (show) visible++;
    });

    if (lostCountEl) lostCountEl.textContent = visible;
    if (lostEmpty)   lostEmpty.hidden = visible !== 0;
};

lostChips.forEach(function (chip) {
    chip.addEventListener('click', function () {

        currentKind = chip.dataset.kind;

        lostChips.forEach(function (c) {
            const active = c === chip;
            c.classList.toggle('is-active', active);
            c.setAttribute('aria-pressed', String(active));
        });

        applyKindFilter();
    });
});

// “查看全部信息”按钮：直接去点那个“全部”标签，省得重复写一遍逻辑
const emptyResetBtn = document.getElementById('emptyResetBtn');
if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', function () {
        const allChip = document.querySelector('.page-main .chip[data-kind="all"]');
        if (allChip) allChip.click();
    });
}


/* ============================================================
   3. 把一条数据变成列表项
   ============================================================ */

const buildLostItem = function (item) {
    const isFound = item.kind === 'found';

    const li = document.createElement('li');
    li.className = 'list-card';
    li.dataset.kind = item.kind;
    li.dataset.id   = item.id;
    li.dataset.mine = '1';

    li.innerHTML = `
        <div class="list-icon" aria-hidden="true"></div>

        <div class="list-main">
            <div class="list-head">
                <span class="list-badge"></span>
                <h3 class="list-title"></h3>
            </div>
            <p class="list-desc"></p>
            <div class="list-meta">
                <span></span><span></span><span></span>
            </div>
        </div>

        <div class="list-side">
            <button type="button" class="btn btn--sm contact-btn"></button>
        </div>
    `;

    li.querySelector('.list-icon').textContent  = item.icon;
    li.querySelector('.list-title').textContent = item.title;

    const badge = li.querySelector('.list-badge');
    badge.textContent = isFound ? '招领' : '寻物';
    badge.classList.toggle('list-badge--busy', isFound);

    const descEl = li.querySelector('.list-desc');
    if (item.desc) {
        descEl.textContent = item.desc;
    } else {
        descEl.remove();
    }

    const meta = li.querySelectorAll('.list-meta span');
    meta[0].textContent = '📍 ' + item.place;
    meta[1].textContent = '⏰ ' + item.time;
    meta[2].textContent = '👤 ' + item.contact;

    // 自己发的信息给“撤回”，别人的给“认领 / 提供线索”
    const btn = li.querySelector('.contact-btn');
    btn.textContent   = '撤回';
    btn.classList.add('btn--ghost');

    return li;
};


/* ============================================================
   4. 认领 / 提供线索 / 撤回
   ============================================================ */

// 同样是事件委托，后来新增的条目自动就能响应
lostList.addEventListener('click', function (event) {

    const btn = event.target.closest('.contact-btn');
    if (!btn) return;

    const card = btn.closest('.list-card');

    /* ---------- 自己发的信息：撤回 ---------- */
    if (card.dataset.mine) {
        const id = card.dataset.id;

        card.remove();

        writeStore(LOST_KEY, readArray(LOST_KEY).filter(function (i) {
            return i.id !== id;
        }));

        applyKindFilter();
        showToast('已撤回信息');
        return;
    }

    /* ---------- 别人的信息：认领或提供线索 ---------- */
    const isFound = card.dataset.kind === 'found';
    const title   = card.querySelector('.list-title').textContent;

    // meta 里那一段格式是「👤 傻尹尹」，先把开头的图标和空格去掉
    const poster = card.querySelector('.list-meta span:last-child')
                       .textContent.replace(/^👤\s*/, '');

    console.log('[模拟] ' + (isFound ? '认领' : '提供线索') + '，联系：', poster);

    // 打开私信，草稿按情况填好 —— 只填不发，用户自己确认。
    // 招领的要核对特征，寻物的要说明线索，两种情况话术不一样。
    openChat(
        poster,
        title,
        isFound
            ? '你好，我想认领「' + title + '」，可以说下特征核对一下吗？'
            : '你好，关于「' + title + '」我这边好像有点线索',
        'lost'
    );
});


/* ============================================================
   5. 发布信息
   ============================================================ */

clearErrorOnInput(publishForm);

// ---------- 表单里的“信息类型”选择 ----------
// 这两个按钮在弹窗内部，所以用 #kindPicker 限定范围，
// 不会和页面顶上那排筛选标签混在一起。
const kindPicker = document.getElementById('kindPicker');
const kindOpts   = kindPicker.querySelectorAll('.chip');

let pickedKind = 'lost';        // lost = 我丢了东西，found = 我捡到东西

kindOpts.forEach(function (opt) {
    opt.addEventListener('click', function () {

        kindOpts.forEach(function (o) {
            const active = o === opt;
            o.classList.toggle('is-active', active);
            o.setAttribute('aria-pressed', String(active));
        });

        pickedKind = opt.dataset.kind;
    });
});

publishBtn.addEventListener('click', function () {
    publishForm.reset();

    // 表单重置后，类型选择器要手动拨回“我丢了东西”
    pickedKind = 'lost';
    kindOpts.forEach(function (o, index) {
        const first = index === 0;
        o.classList.toggle('is-active', first);
        o.setAttribute('aria-pressed', String(first));
    });

    publishModal.showModal();
    lockScroll();
});

publishModal.addEventListener('close', function () {
    unlockScroll();
});

publishModal.querySelector('.modal-close').addEventListener('click', function () {
    publishModal.close();
});

publishForm.querySelector('[data-close]').addEventListener('click', function () {
    publishModal.close();
});

publishModal.addEventListener('click', function (event) {
    if (event.target === publishModal) publishModal.close();
});

publishForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const titleInput   = document.getElementById('pubTitle');
    const placeInput   = document.getElementById('pubPlace');
    const contactInput = document.getElementById('pubContact');

    const title   = titleInput.value.trim();
    const place   = placeInput.value.trim();
    const contact = contactInput.value.trim();

    const okTitle   = checkRequired(titleInput);
    const okPlace   = checkRequired(placeInput);
    const okContact = checkRequired(contactInput);

    if (!okTitle || !okPlace || !okContact) {
        focusFirstError(publishForm);
        return;
    }

    const item = {
        id:        makeId(),
        kind:      pickedKind,
        icon:      pickedKind === 'found' ? '🎁' : '🔍',
        title:     title,
        desc:      document.getElementById('pubDesc').value.trim(),
        place:     place,
        time:      document.getElementById('pubTime').value,
        contact:   contact,
        createdAt: Date.now()
    };

    const list = readArray(LOST_KEY);
    list.unshift(item);
    writeStore(LOST_KEY, list);

    lostList.prepend(buildLostItem(item));

    publishModal.close();
    publishForm.reset();

    // 新信息的类型可能不在当前筛选里，切回“全部”保证看得见
    const allChip = document.querySelector('.page-main .chip[data-kind="all"]');
    if (allChip) allChip.click();

    showToast('信息已发布');
    console.log('已发布失物信息：', title);
});


/* ============================================================
   6. 页面打开时恢复
   ============================================================ */

const savedLost = readArray(LOST_KEY);

if (savedLost.length > 0) {
    // 倒着插，这样最后发布的会排在最上面
    savedLost.slice().reverse().forEach(function (item) {
        lostList.prepend(buildLostItem(item));
    });

    console.log('已从本地恢复 ' + savedLost.length + ' 条我发布的失物信息');
}

// 初始化计数
applyKindFilter();
