/* ============================================================
   校园集市 · 校园跑腿页

   这一页要做四件事：
     1. 按任务类型筛选
     2. 发布新任务（存进本地，刷新后还在）
     3. 接单（演示用，没有后端）
     4. 撤回自己发布的任务

   依赖 common.js（提示条、本地存储、表单校验工具）
   和 chat.js（接单后弹出的私信界面）。
   ============================================================ */


/* ============================================================
   1. 元素引用
   ============================================================ */

const taskList    = document.getElementById('taskList');
const typeChips   = document.querySelectorAll('.chip[data-type]');
const taskCountEl = document.getElementById('resultCount');
const taskEmpty   = document.getElementById('emptyState');

const publishBtn   = document.getElementById('publishBtn');
const publishModal = document.getElementById('publishModal');
const publishForm  = document.getElementById('publishForm');

// 存“我自己发布的任务”。注意只存自己的，
// 页面上那 6 条演示任务是写死在 HTML 里的，不参与存储。
const TASK_KEY = 'campus_market_my_tasks';

// 当前选中的任务类型，'all' 表示不筛
let currentType = 'all';


/* ============================================================
   2. 按类型筛选
   ============================================================ */

// 每次现查一遍，因为用户可以发布新任务，新条目是后来才加进列表的
const getTasks = function () {
    return Array.from(taskList.querySelectorAll('.list-card'));
};

const applyTypeFilter = function () {
    let visible = 0;

    getTasks().forEach(function (card) {
        const show = currentType === 'all' || card.dataset.type === currentType;

        card.hidden = !show;
        if (show) visible++;
    });

    if (taskCountEl) taskCountEl.textContent = visible;
    if (taskEmpty)   taskEmpty.hidden = visible !== 0;
};

typeChips.forEach(function (chip) {
    chip.addEventListener('click', function () {

        currentType = chip.dataset.type;

        typeChips.forEach(function (c) {
            const active = c === chip;
            c.classList.toggle('is-active', active);
            c.setAttribute('aria-pressed', String(active));
        });

        applyTypeFilter();
    });
});

// “查看全部任务”按钮：把筛选拨回“全部”
const emptyResetBtn = document.getElementById('emptyResetBtn');
if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', function () {
        const allChip = document.querySelector('.chip[data-type="all"]');
        if (allChip) allChip.click();      // 直接触发那个按钮，省得重复写一遍逻辑
    });
}


/* ============================================================
   3. 把一条任务数据变成列表项
   ============================================================ */

// 不同类型配不同图标，列表一眼扫过去能区分开
const TASK_ICONS = {
    '取快递': '📦',
    '带饭':   '🍜',
    '代买':   '🛒',
    '其他':   '📌'
};

const buildTask = function (task) {
    const li = document.createElement('li');
    li.className = 'list-card';
    li.dataset.type = task.type;
    li.dataset.id   = task.id;
    li.dataset.mine = '1';         // 标记“这是我发的”，按钮会变成“撤回”

    // 骨架里一个用户输入都没有，所以是安全的；
    // 下面用户填的内容全部走 textContent。
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
            <span class="list-price"></span>
            <button type="button" class="btn btn--sm take-btn"></button>
        </div>
    `;

    li.querySelector('.list-icon').textContent  = task.icon || TASK_ICONS[task.type] || '📌';
    li.querySelector('.list-badge').textContent = '待接单';
    li.querySelector('.list-title').textContent = task.title;

    const descEl = li.querySelector('.list-desc');
    if (task.desc) {
        descEl.textContent = task.desc;
    } else {
        // 没填说明就把这个空 <p> 删掉，否则会留下一条多余的空白
        descEl.remove();
    }

    const meta = li.querySelectorAll('.list-meta span');
    meta[0].textContent = '📍 ' + task.place;
    meta[1].textContent = '⏰ ' + task.time;
    meta[2].textContent = '👤 我';

    li.querySelector('.list-price').textContent = '¥' + task.pay;

    // 自己发的任务，按钮是“撤回”；别人的是“我要接单”
    const btn = li.querySelector('.take-btn');
    btn.textContent = '撤回';
    btn.classList.add('btn--ghost');

    return li;
};


/* ============================================================
   4. 接单 / 撤回
   ============================================================ */

// 记下“我接过哪些任务”，存的是任务编号组成的数组。
// 有了它，刷新页面、甚至关掉浏览器再回来，接过的任务还是已结单状态。
const ACCEPT_KEY = 'campus_market_accepted_tasks';

const loadAccepted = function () {
    const raw = readStore(ACCEPT_KEY, []);
    return Array.isArray(raw) ? raw : [];
};

let accepted = loadAccepted();

const saveAccepted = function () {
    writeStore(ACCEPT_KEY, accepted);
};

// 把一张任务卡片切换成“你已经接过”的样子
const markAccepted = function (card) {
    const badge = card.querySelector('.list-badge');
    badge.textContent = '进行中';
    badge.classList.add('list-badge--busy');

    const btn = card.querySelector('.take-btn');
    btn.textContent = '已结单';
    btn.classList.remove('btn--primary');
    btn.classList.add('btn--ghost', 'take-btn--done');

    // ★ 注意这里是 false，按钮仍然可以点。
    //   接完单之后必然还要跟对方聊具体时间、聊地点，
    //   按钮如果彻底禁用，私信就再也打不开了。
    //   所以「已结单」不是死状态，再点一次 = 重新打开这段私信。
    btn.disabled = false;
};

// 页面打开时，把之前接过的任务恢复出来
const restoreAccepted = function () {
    getTasks().forEach(function (card) {
        // 自己发布的任务不参与“接单”，跳过
        if (card.dataset.mine) return;

        if (card.dataset.id && accepted.includes(card.dataset.id)) {
            markAccepted(card);
        }
    });
};

/* ------------------------------------------------------------
   接单后私信里预填的话术

   一句通用的「方便约个时间吗」对什么任务都成立，但也对什么都不贴 ——
   取快递就该提驿站，带饭就该提口味备注。所以按任务类型分开写。

   {title} 是占位符，用的时候会替换成真正的任务标题。
   ------------------------------------------------------------ */

// 刚点完「我要接单」时说的话
const TAKE_DRAFTS = {
    '取快递': '你好，我顺路去驿站取「{title}」，取到给你送到楼下～',
    '带饭':   '你好，我这就去食堂，「{title}」的口味备注我记下了，打包好给你送过去。',
    '代买':   '你好，「{title}」我顺路可以带，你要买的东西发我就行～',
    '其他':   '你好，「{title}」这个任务我接了，我们约个时间？'
};

// 已经接过的任务，再点开私信时该聊的是「什么时候」和「送到哪」
const FOLLOW_DRAFTS = {
    '取快递': '我大概什么时候去取比较方便？',
    '带饭':   '你大概几点想吃？我按着时间去买。',
    '代买':   '你要买的东西发我一下吧～',
    '其他':   '我们约个具体时间？'
};

// 查表 + 把 {title} 换成真正的任务标题。
// 万一以后加了新任务类型却忘了登记话术，会退回到「其他」那一条，
// 而不是返回 undefined 拼出一个坏消息。
const draftFor = function (table, type, title) {
    const tpl = table[type] || table['其他'];
    return tpl.replace('{title}', title);
};


// 和商品那边一样用“事件委托”：
// 绑在列表上一次，后来新增的任务自动就能响应，不用单独再绑。
taskList.addEventListener('click', function (event) {

    const btn = event.target.closest('.take-btn');
    if (!btn) return;

    const card = btn.closest('.list-card');

    /* ---------- 自己发的任务：撤回 ---------- */
    if (card.dataset.mine) {
        const id = card.dataset.id;

        card.remove();

        // 从本地仓库里也删掉，否则刷新一下它又回来了
        writeStore(TASK_KEY, readArray(TASK_KEY).filter(function (t) {
            return t.id !== id;
        }));

        applyTypeFilter();
        showToast('已撤回任务');
        return;
    }

    const title = card.querySelector('.list-title').textContent;

    // 取发布者的名字。meta 里那一段的格式是「👤 五子棋」，
    // 所以先把开头的图标和空格去掉。
    const poster = card.querySelector('.list-meta span:last-child')
                       .textContent.replace(/^👤\s*/, '');

    /* ---------- 已经接过的：再点一次 = 重新打开私信 ---------- */
    if (btn.classList.contains('take-btn--done')) {
        openChat(poster, title, draftFor(FOLLOW_DRAFTS, card.dataset.type, title), 'errand');
        return;
    }

    /* ---------- 别人已经接走的：点不动 ---------- */
    if (btn.disabled) return;

    /* ---------- 还没人接的：我来接 ---------- */

    // ★ 先把编号存下来，再改界面。
    //   顺序反了的话，万一存储失败，界面已经变了、数据却没记上，
    //   两边就对不上了。写数据在前、改界面在后，是更稳的顺序。
    if (card.dataset.id && !accepted.includes(card.dataset.id)) {
        accepted.push(card.dataset.id);
        saveAccepted();
    }

    markAccepted(card);

    console.log('[模拟] 接单：', title, '｜发布者：', poster);

    // ★ 接完单直接把私信打开。
    //   现实里接下来就是「约时间、问地点」，接单和联系本来就是一件事，
    //   分成两步反而别扭。
    //
    //   第三个参数是草稿：只填进输入框，不自动发出去。
    //   替用户把话说了很容易出错，让他自己看一眼再按发送更稳妥。
    //
    //   （这里没有 showToast —— 弹窗会把提示条整个盖住，弹了也看不见，
    //     卡片变成「进行中」本身就是反馈。）
    openChat(poster, title, draftFor(TAKE_DRAFTS, card.dataset.type, title), 'errand');
});


/* ============================================================
   5. 发布任务
   ============================================================ */

clearErrorOnInput(publishForm);

const openPublish = function () {
    publishForm.reset();
    publishModal.showModal();
    lockScroll();
};

publishBtn.addEventListener('click', openPublish);

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

    const titleInput = document.getElementById('pubTitle');
    const payInput   = document.getElementById('pubPay');
    const placeInput = document.getElementById('pubPlace');

    const title = titleInput.value.trim();
    const place = placeInput.value.trim();
    const pay   = Number(payInput.value);

    // 必填项一起检查，一次性把所有问题标出来
    const okTitle = checkRequired(titleInput);
    const okPlace = checkRequired(placeInput);

    // 报酬除了不能空，还得是个大于 0 的数
    const okPay = payInput.value.trim() !== '' && pay > 0;
    payInput.closest('.field').classList.toggle('has-error', !okPay);

    if (!okTitle || !okPlace || !okPay) {
        focusFirstError(publishForm);
        return;
    }

    const type = document.getElementById('pubType').value;

    const task = {
        id:        makeId(),
        type:      type,
        icon:      TASK_ICONS[type] || '📌',
        title:     title,
        desc:      document.getElementById('pubDesc').value.trim(),
        place:     place,
        time:      document.getElementById('pubTime').value,
        pay:       pay,
        createdAt: Date.now()
    };

    // 存进本地，然后插到列表最前面
    const list = readArray(TASK_KEY);
    list.unshift(task);
    writeStore(TASK_KEY, list);

    taskList.prepend(buildTask(task));

    publishModal.close();
    publishForm.reset();

    // 新任务的类型可能不在当前筛选里，切回“全部”让它一定看得见
    const allChip = document.querySelector('.chip[data-type="all"]');
    if (allChip) allChip.click();

    showToast('任务已发布');
    console.log('已发布跑腿任务：', title, '¥' + pay);
});


/* ============================================================
   6. 页面打开时恢复
   ============================================================ */

const savedTasks = readArray(TASK_KEY);

if (savedTasks.length > 0) {
    // 从后往前插，这样先发布的会排在后面，顺序和 unshift 时一致
    savedTasks.slice().reverse().forEach(function (task) {
        taskList.prepend(buildTask(task));
    });

    console.log('已从本地恢复 ' + savedTasks.length + ' 个我发布的跑腿任务');
}

// 把之前接过的任务恢复出来（必须在静态任务都在页面上之后执行）
restoreAccepted();

// 初始化计数
applyTypeFilter();
