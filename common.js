/* ============================================================
   校园集市 · 公共脚本

   所有页面都会引入这个文件，里面放的是“每个页面都可能用到”的东西：

     1. 顶部提示条
     2. 本地存储的通用读写
     3. 几个通用小工具（生成编号 / 格式化时间）
     4. 占位链接的统一处理

   ★ 关于多页面之间怎么共用代码：
     每个页面用 <script src="common.js" defer> 引一次这个文件。
     浏览器会缓存它，第二个页面打开时不会重新下载。

     注意：这几个 .js 文件不是“模块”，它们共享同一个全局作用域。
     所以里面的变量名必须各自唯一，不能重名——
     重名的话浏览器会直接报 "Identifier has already been declared" 然后整个脚本挂掉。
     下面用的常量都带前缀或语义化命名，就是为了避开这个坑。
   ============================================================ */


/* ============================================================
   1. 顶部提示条
   ============================================================ */

const toastWrap = document.getElementById('toastWrap');

// 在页面顶部弹出一条会自动消失的小提示。
// 每个页面都要放一个 <div id="toastWrap"> 容器，否则这里会报错。
const showToast = function (message) {
    if (!toastWrap) return;      // 万一某个页面忘了放容器，静默跳过而不是崩掉

    const toast = document.createElement('div');
    toast.className = 'toast';

    // 用 textContent 而不是 innerHTML：
    // 万一提示语里带了用户输入的内容（比如商品标题），
    // textContent 保证它只会被当纯文本显示，不会被当 HTML 解析。
    toast.textContent = message;

    toastWrap.appendChild(toast);

    // ★ 为什么“加上 is-show”这一步要放进 requestAnimationFrame 里？
    //
    //   浏览器不会在元素刚插入的同一刻就把它画出来。
    //   如果 append 完立刻加 is-show，浏览器只看到最终状态，
    //   中间没有任何“变化过程”，过渡动画就完全不会播 ——
    //   提示条会直接“啪”地出现，而不是淡入。
    //
    //   requestAnimationFrame 会等浏览器准备画下一帧时再执行回调。
    //   那时元素已经以初始状态渲染过一次了，动画才有得可过渡。
    requestAnimationFrame(function () {
        toast.classList.add('is-show');
    });

    // 2.4 秒后开始退场
    setTimeout(function () {
        toast.classList.remove('is-show');   // 去掉类，反向过渡自动生效

        // transitionend 是“过渡动画播完”那一刻触发的事件。
        // { once: true } 表示这个监听器只用一次，触发后自动注销 ——
        // 不用手动 removeEventListener，也不会因为动画属性有两个而重复触发。
        toast.addEventListener('transitionend', function () {
            toast.remove();      // 把它从页面上删掉，别让 DOM 越堆越多
        }, { once: true });

    }, 2400);
};


/* ============================================================
   2. 本地存储的通用读写

   localStorage 只能存字符串，所以存之前要 JSON.stringify、
   取出来之后要 JSON.parse。这两步每个页面都要做，
   所以包成两个函数，省得到处写重复的 try / catch。
   ============================================================ */

// 读。读不到、或者内容坏掉，就返回 fallback（默认值）。
const readStore = function (key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
        // 内容被手动改坏了、或者浏览器隐私模式禁止访问
        console.warn('读取本地数据失败 [' + key + ']，用默认值代替：', error);
        return fallback;
    }
};

// 写。成功返回 true，失败返回 false。
const writeStore = function (key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        // 空间满了、或者浏览器禁止存储
        console.warn('写入本地数据失败 [' + key + ']：', error);
        return false;
    }
};

// 读一个「本来应该是个数组」的存储项。
//
// ★ 为什么不直接用 readStore：
//   readStore 只保证「能解析成 JSON」，不保证解析出来是数组。
//   如果存储被人手动改成了 {"bad":1}，拿到的东西上就没有 .filter / .unshift，
//   一调就抛错 —— 而且往往是在「已经改了界面、还没改数据」的中间步骤抛的，
//   结果就是卡片从页面上消失了、存储里那条却还在，两边当场对不上。
//
//   凡是后面要当数组用的，都从这里读。
const readArray = function (key) {
    const raw = readStore(key, []);
    return Array.isArray(raw) ? raw : [];
};


/* ------------------------------------------------------------
   弹窗打开时锁住背景滚动

   ★ 为什么不能简单地「关掉一个弹窗就解锁」？

     从一个弹窗跳到另一个弹窗时（比如商品详情里点「联系卖家」），
     代码写的是「先 close 旧的、紧接着 showModal 新的」。

     但 <dialog> 的 close 事件是【异步派发】的 ——
     旧弹窗的 close 回调要等到新弹窗已经打开之后才执行。
     如果它无脑把 is-modal-open 删掉，就会变成
     「新弹窗开着，背后的页面却能滚」。

     所以解锁之前先看一眼：还有没有别的弹窗开着？
   ------------------------------------------------------------ */
const lockScroll = function () {
    document.documentElement.classList.add('is-modal-open');
};

const unlockScroll = function () {
    // 还有任何 <dialog open> 就说明不该解锁
    if (!document.querySelector('dialog[open]')) {
        document.documentElement.classList.remove('is-modal-open');
    }
};


/* ============================================================
   3. 通用小工具
   ============================================================ */

// 生成一个几乎不可能重复的编号。
// Date.now() 是时间戳，再拼一小段随机字符，
// 保证同一毫秒内连续生成两个也不会撞号。
const makeId = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

// 时间戳 → “几分钟前”这样的可读文字。
//
// 为什么要换算，而不是直接存“刚刚”两个字？
// 因为数据要存进本地，今天发的信息明天打开还写着“刚刚”就穿帮了。
// 存时间戳、用的时候再换算，才能一直准确。
const formatTime = function (createdAt) {
    // 时间戳单位是毫秒，除以 60000 换算成分钟
    const minutes = Math.floor((Date.now() - createdAt) / 60000);

    if (minutes < 1)  return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' 小时前';

    return Math.floor(hours / 24) + ' 天前';
};


/* ------------------------------------------------------------
   3.2 表单校验的三个小工具

   发布商品、发布跑腿任务、发布失物信息，三处的校验逻辑是一样的，
   所以提到公共层，不要每个页面各写一遍。
   ------------------------------------------------------------ */

// 给某个表单里的所有输入框绑定“一开始打字就清掉错误状态”。
// 不这么做的话，红框会一直红到用户重新提交为止，体验很差。
const clearErrorOnInput = function (scope) {
    scope.querySelectorAll('.field-input').forEach(function (input) {
        input.addEventListener('input', function () {
            input.closest('.field').classList.remove('has-error');
        });
    });
};

// 检查某个输入框是不是空的。
// closest('.field') 是往上找到这个输入框所属的字段容器，
// 错误的状态类加在它身上，CSS 里的 .field.has-error 才会生效。
const checkRequired = function (input) {
    const empty = input.value.trim() === '';
    input.closest('.field').classList.toggle('has-error', empty);
    return !empty;
};

// 把光标送到第一个出错的字段，用户不用自己找
const focusFirstError = function (scope) {
    const first = scope.querySelector('.field.has-error .field-input');
    if (first) first.focus();
};


/* ============================================================
   4. 占位链接的统一处理

   页面上还有不少 href="#" 的链接（导航、页脚、一些跳转入口）。
   点了之后浏览器会默认“跳回页面顶部”，用户会以为页面出毛病了。
   与其让它默默跳走，不如统一拦下来，给一句明确的回复。
   ============================================================ */

document.querySelectorAll('a[href="#"]').forEach(function (link) {

    link.addEventListener('click', function (event) {

        // 拦掉默认跳转：href="#" 会跳到页面顶部，
        // 还会往地址栏后面挂一个没用的 #
        event.preventDefault();

        // data-coming 里存的是更准确的名字（比如“校园跑腿”）；
        // 没写这个属性的链接，就退而用链接自己的文字当名字
        const name = link.dataset.coming || link.textContent.trim();

        showToast('「' + name + '」还在开发中');
    });
});


/* ============================================================
   5. 回到顶部

   按钮的 HTML 写在各个页面里（id="toTop"），
   逻辑集中在这儿，所有页面共用。
   ============================================================ */

const toTopBtn = document.getElementById('toTop');

if (toTopBtn) {

    // 滚过这个距离之后按钮才出现。
    // 页面刚一动就冒出来会很吵，滚过差不多一屏才出现比较自然。
    const SHOW_AFTER = 400;

    const updateToTop = function () {
        toTopBtn.classList.toggle('is-show', window.scrollY > SHOW_AFTER);
    };

    // { passive: true } 是在告诉浏览器：
    // “这个监听器不会调用 preventDefault，你不用等它执行完就能滚”。
    // 滚动是高频事件，加了这个页面滚起来会跟手很多。
    window.addEventListener('scroll', updateToTop, { passive: true });

    // 刚进页面时也先算一次。
    // 因为浏览器会记住上次的滚动位置，刷新后可能一进来就已经在页面中间了。
    updateToTop();

    toTopBtn.addEventListener('click', function () {
        // 系统开了“减少动态效果”就直接跳，不做平滑滚动
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
}
