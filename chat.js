/* ============================================================
   校园集市 · 私信（点“联系卖家 / 我要接单 / 我有线索”打开）

   一个极简的聊天界面：
     顶部  —— 对话对象
     中间  —— 消息列表（带动画、时间分隔、头像分组）
     底部  —— 快捷短语 + 输入框

   消息按“和谁的对话”分开存进 localStorage，刷新后还在。

   依赖 common.js：readStore / writeStore。

   ★ 这是演示版本，消息不会真的发出去。
     真实项目里，发消息要发给服务器，服务器再推给对方的设备；
     前端只负责“把自己发的内容显示出来”和“把收到的内容显示出来”。
   ============================================================ */

const chatModal  = document.getElementById('chatModal');
const chatList   = document.getElementById('chatList');
const chatQuick  = document.getElementById('chatQuick');
const chatName   = document.getElementById('chatName');
const chatSub    = document.getElementById('chatSub');
const chatAvatar = document.getElementById('chatAvatar');
const chatForm   = document.getElementById('chatForm');
const chatInput  = document.getElementById('chatInput');

// 所有对话存在一个对象里，形状是：
//   { "五子棋": [ {from, text, at}, ... ], "小猪婷": [ ... ] }
// 按“人”分而不是按“商品”分，因为现实中你和同一个人的聊天是一条线。
const CHAT_KEY = 'campus_market_chats';

// 当前正在和谁聊。关掉弹窗时会清空。
let chatSeller = '';

// 当前对话属于哪个板块。决定招呼语、快捷短语和自动回复用什么。
// ★ 这里必须是一个「字符串」，而且要和下面 CHAT_SCENES 的键名对得上。
//   原先写成裸的 goods，那是个不存在的变量，脚本一加载就抛
//   ReferenceError，它后面的代码（包括打开私信、发送消息的监听）
//   全都不会执行 —— 表现就是点「联系卖家」完全没反应。
let chatScene = 'goods';

// 弹窗是什么时候打开的（毫秒时间戳）。
// 用来忽略“刚打开就被双击的第二下关掉”—— 见下面遮罩点击那一段。
let chatOpenedAt = 0;


/* ============================================================
   1. 场景配置

   同一个聊天组件，三个页面用。但“问商品”和“接单”“找失物”
   该说的话完全不一样，所以按场景各配一套：
     greeting 第一次打开时的招呼语
     quick    输入框上方的快捷短语，点一下就填进输入框
     replies  演示用的自动回复池
   ============================================================ */

const CHAT_SCENES = {

    /* ---------- 二手交易 ---------- */
    goods: {
        greeting: '你好，这件东西还在的～ 有什么想了解的可以直接问。',

        quick: ['还在吗？', '能便宜点吗？', '成色怎么样？', '什么时候方便面交？'],

        replies: [
            '在的，你想了解哪方面？',
            '成色没问题的，可以约个时间面交看看。',
            '价格可以小刀一点，诚心要的话好商量。',
            '我这几天下午都在学校，约在食堂门口方便吗？',
            '稍等，我拍几张细节图给你看看。'
        ]
    },

    /* ---------- 校园跑腿 ---------- */
    errand: {
        greeting: '你好，接单的话我们约个时间～ 我这边什么时候都方便。',

        quick: ['我快到了', '大概还要多久？', '送到哪个门？', '钱怎么给你？'],

        replies: [
            '好的，麻烦你了！',
            '我这边随时都行，你方便就好。',
            '钱我先转你吧，还是当面给？',
            '辛苦了，到了给我发个消息。',
            '不着急，你路上慢点。'
        ]
    },

    /* ---------- 失物招领 ---------- */
    lost: {
        greeting: '你好，看到你发的消息了～ 想核对一下特征吗？',

        quick: ['能描述一下特征吗？', '在哪儿捡到的？', '什么时候方便拿？', '可以当面确认吗？'],

        replies: [
            '好的，麻烦你了，我这就去看看。',
            '特征我再说细一点：边上有个不太明显的小划痕。',
            '我基本都在学校，你方便就行。',
            '太感谢了，找回来一定请你喝奶茶。',
            '要不我们约在图书馆门口见？'
        ]
    }
};

// 查场景配置。万一传进来一个没登记的场景，退回 goods，不会变成 undefined。
const sceneOf = function (scene) {
    return CHAT_SCENES[scene] || CHAT_SCENES.goods;
};


/* ============================================================
   2. 消息的存取
   ============================================================ */

const loadChats = function () {
    const raw = readStore(CHAT_KEY, {});

    // 保险起见确认拿到的是个普通对象。
    // 万一有人手动把存储改成了数组或字符串，下面的取值会出错。
    const ok = raw && typeof raw === 'object' && !Array.isArray(raw);
    return ok ? raw : {};
};

const loadMessages = function (seller) {
    const all = loadChats();
    return Array.isArray(all[seller]) ? all[seller] : [];
};

// 往某人的对话里加一条消息，并写回本地
const pushMessage = function (seller, from, text) {
    const all = loadChats();

    if (!Array.isArray(all[seller])) all[seller] = [];

    all[seller].push({ from: from, text: text, at: Date.now() });
    writeStore(CHAT_KEY, all);
};


/* ============================================================
   3. 渲染消息

   ★ 全程用 textContent。
     消息内容完全来自用户输入，用 innerHTML 拼的话，
     别人发一段 <img onerror=...> 就能在你页面上执行脚本。
   ============================================================ */

// “刚刚 / 14:32 / 昨天 14:32” 这样的时间标签
const formatStamp = function (ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');

    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();

    if (sameDay) return hh + ':' + mm;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天 ' + hh + ':' + mm;

    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh + ':' + mm;
};

// 居中的系统提示
const renderSystem = function (msg) {
    const li = document.createElement('li');
    li.className = 'chat-sys';
    li.textContent = msg.text;
    return li;
};

// 居中的时间分隔
const renderStamp = function (ts) {
    const li = document.createElement('li');
    li.className = 'chat-stamp';
    li.textContent = formatStamp(ts);
    return li;
};

// 一条消息（头像 + 气泡）。
// showAvatar 为 false 时，头像位置仍然占着，只是不显示内容 ——
// 这样同一组里的气泡左边能对齐成一列，不会参差不齐。
const renderBubble = function (msg, showAvatar) {
    const mine = msg.from === 'me';

    const li = document.createElement('li');
    li.className = 'chat-row ' + (mine ? 'chat-row--me' : 'chat-row--them');

    if (!mine) {
        const avatar = document.createElement('div');
        avatar.className = 'chat-avatar chat-avatar--sm';

        if (showAvatar) {
            // 名字首字当头像，不需要图片
            avatar.textContent = chatSeller.slice(0, 1);
        } else {
            avatar.classList.add('chat-avatar--ghost');
        }

        avatar.setAttribute('aria-hidden', 'true');
        li.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg ' + (mine ? 'chat-msg--me' : 'chat-msg--them');
    bubble.textContent = msg.text;
    li.appendChild(bubble);

    return li;
};

// “对方正在输入”的三个跳动小点
const renderTyping = function () {
    const li = document.createElement('li');
    li.className = 'chat-row chat-row--them';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar chat-avatar--sm';
    avatar.textContent = chatSeller.slice(0, 1);
    avatar.setAttribute('aria-hidden', 'true');

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg chat-msg--them chat-msg--typing';
    // 这里 innerHTML 里没有任何用户输入，是固定骨架，安全
    bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    bubble.setAttribute('aria-label', '对方正在输入');

    li.appendChild(avatar);
    li.appendChild(bubble);

    return li;
};

// 把整段对话重画一遍
const renderChat = function (seller) {
    chatList.innerHTML = '';      // 清空。这里没有任何用户输入，所以是安全的

    const msgs = loadMessages(seller);

    // 记着上一条是谁发的、什么时候发的，用来决定“要不要显示头像 / 时间”
    let lastFrom = null;
    let lastAt = 0;

    msgs.forEach(function (msg) {

        // 系统提示：居中、小字，并且会打断消息分组
        if (msg.from === 'sys') {
            chatList.appendChild(renderSystem(msg));
            lastFrom = null;
            lastAt = msg.at;
            return;
        }

        // 距上一条超过 5 分钟，中间插一个时间标签。
        // 每条都标时间太吵，只在“断档”的地方标才符合聊天软件的习惯。
        if (msg.at - lastAt > 5 * 60 * 1000) {
            chatList.appendChild(renderStamp(msg.at));
        }

        // 只有“换人了”才显示头像 —— 同一个人连发几条，只在第一条上露脸
        chatList.appendChild(renderBubble(msg, msg.from !== lastFrom));

        lastFrom = msg.from;
        lastAt = msg.at;
    });

    scrollToBottom();
};

// 滚到底部，让最新的消息露出来
const scrollToBottom = function () {
    chatList.scrollTop = chatList.scrollHeight;
};


/* ============================================================
   4. 快捷短语

   聊天里最常说的就是那几句，每次手打太麻烦。
   点一下就填进输入框（不是直接发出去），用户还能改两个字再发。
   ============================================================ */

const renderQuick = function (scene) {
    chatQuick.innerHTML = '';

    sceneOf(scene).quick.forEach(function (text) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-chip';
        btn.textContent = text;

        btn.addEventListener('click', function () {
            chatInput.value = text;
            chatInput.focus();
        });

        chatQuick.appendChild(btn);
    });
};


/* ============================================================
   5. 打开 / 关闭
   ============================================================ */

// seller ：对方的称呼。它同时也是这段对话在存储里的键。
// context：这次是在聊什么（商品名 / 跑腿任务 / 失物信息），显示在顶部副标题
// draft  ：预先填进输入框的草稿，用户可以改了再发（可以不给）
// scene  ：goods / errand / lost，决定用哪一套招呼语、短语和回复
const openChat = function (seller, context, draft, scene) {
    chatSeller = seller;
    chatScene  = scene || 'goods';

    chatName.textContent   = seller;
    chatAvatar.textContent = seller.slice(0, 1);
    chatSub.textContent    = context ? '关于：' + context : '校园集市私信';

    // 第一次打开这段对话时，先垫两句，免得对着空白发呆
    if (loadMessages(seller).length === 0) {
        pushMessage(seller, 'sys',  '演示环境：消息只存在你自己的浏览器里，不会真的发给对方');
        pushMessage(seller, 'them', sceneOf(chatScene).greeting);
    }

    renderChat(seller);
    renderQuick(chatScene);

    // ★ 草稿是「填进输入框」，不是「直接发出去」。
    //   替用户把话说了很容易发错，让他自己看一眼、改两个字再发更稳妥。
    chatInput.value = draft || '';

    chatOpenedAt = Date.now();
    chatModal.showModal();
    lockScroll();

    chatInput.focus();

    // 有草稿时把光标挪到末尾，用户可以接着往下改，不用先按 End 键
    if (draft) {
        chatInput.setSelectionRange(draft.length, draft.length);
    }
};

document.getElementById('chatClose').addEventListener('click', function () {
    chatModal.close();
});

// 点遮罩也能关（和另外几个弹窗是同一套判断）
chatModal.addEventListener('click', function (event) {
    if (event.target !== chatModal) return;

    // ★ 双击还会踩到一个坑：
    //   用户双击「我要接单」时，第一下打开了私信面板
    //   （面板只有 460px 宽、屏幕居中），第二下按原坐标落下来，
    //   打中的正好是面板外的遮罩区 —— 于是刚打开的私信被自己关掉了，
    //   观感是「弹窗一闪而过」。
    //
    //   加一道时间闸：刚打开后 350ms 内的遮罩点击一律不理。
    //   正常人不会在这么短的时间里就决定把它关掉。
    if (Date.now() - chatOpenedAt < 350) return;

    chatModal.close();
});

chatModal.addEventListener('close', function () {
    unlockScroll();

    // 清掉“当前对话对象”。
    // 这样一来，如果刚才有自动回复排在队列里还没来得及显示，
    // 它就不会被错插到另一个人（或者已经关掉的）对话里。
    chatSeller = '';
});


/* ============================================================
   6. 发送
   ============================================================ */

chatForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const text = chatInput.value.trim();
    if (text === '') {
        chatInput.focus();
        return;
    }

    // 1) 存起来
    pushMessage(chatSeller, 'me', text);

    // 2) 立刻显示出来 —— 不等服务器回应，先把消息上屏。
    //    这叫“乐观更新”：用户感觉是瞬间发出的。
    //    真实项目里如果发送失败，还要把它标成红色感叹号并允许重发。
    //
    //    自己发的不显示头像（右边本来就是“我”），所以第二个参数随便传
    chatList.appendChild(renderBubble({ from: 'me', text: text }, false));
    chatInput.value = '';
    scrollToBottom();

    console.log('[模拟] 发送给「' + chatSeller + '」：', text);

    // 3) 演示用的自动回复
    autoReply(chatScene);
});


/* ============================================================
   7. 演示用的自动回复

   真实项目里没有这一段：消息是由服务器推过来的，
   前端只负责监听并显示。这里为了让演示不至于“发出去就没了”，
   用一个定时器模拟对方回话。
   ============================================================ */

const autoReply = function (scene) {
    // 先把对方的名字记下来。
    // 万一用户在等待期间换了对话（或者关掉了弹窗），
    // 我们还知道这条回复该进哪段对话。
    const target = chatSeller;

    // ★ 先把可能已经存在的「正在输入」清掉。
    //   一秒内连发两条时，两个 autoReply 会各自插一个，
    //   屏幕上就会同时出现两组跳动的小点。
    const staleTyping = chatList.querySelector('.chat-msg--typing');
    if (staleTyping) staleTyping.closest('.chat-row').remove();

    // 再把「正在输入」显示出来，让等待有个着落，
    // 而不是消息发出去以后界面一片死寂
    let typingEl = null;

    if (chatModal.open) {
        typingEl = renderTyping();
        chatList.appendChild(typingEl);
        scrollToBottom();
    }

    // 0.9 ~ 1.7 秒，不至于太规律
    const delay = 900 + Math.random() * 800;

    setTimeout(function () {

        const pool = sceneOf(scene).replies;
        const text = pool[Math.floor(Math.random() * pool.length)];

        // 存进记录：不管弹窗开没开，消息本身都要留下
        pushMessage(target, 'them', text);

        // 收回“正在输入”。即使用户已经关掉弹窗，这个元素也还在列表里，要一并清掉。
        if (typingEl) typingEl.remove();

        // 但只有当这个对话此刻还开着，才往屏幕上插。
        // 少了这个判断，用户关掉弹窗后回复会“插进空气里”，
        // 下次打开就会看到一条重复的。
        if (target === chatSeller && chatModal.open) {
            chatList.appendChild(renderBubble({ from: 'them', text: text }, true));
            scrollToBottom();
        }

        console.log('[模拟]「' + target + '」自动回复：', text);

    }, delay);
};
