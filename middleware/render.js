const path = require('path');
const nunjucks = require('nunjucks');

// Nunjucks settings & env
var settings, env;
var app;

/**
 * 向Koa context 注入 render 方法
 */
exports = module.exports = async function render(ctx, next) {

    // 区分于Layout以及子模块
    var main = true;

    /**
     * option = {
     *  name: 'template/path',
     * }
    */
    ctx.render = function (data, option) {

        const defaultView = path.join(ctx.routeInfo.controller, ctx.routeInfo.action);
        ctx.renderInfo = {
            view: (option && option.name) || defaultView,
            data: data || {}
        }

        if(main) {

            ctx.renderInfo.layout = option && option.layout ? option.layout : 'layout/index';
            main = false;
        }
    };

    await next();
};

exports.startup = function(_app) {

    app = _app, settings = app.settings.nunjucks,
        env = createEnv('views', {});

    env.addExtension('renderExtension', new RenderExtension());

    app.render = tryRender;
    app.safeString = safeString;
}

/**
 * {% render %} custom tag
 */
function RenderExtension() {

    this.tags = ['render'];

    this.parse = function(parser, nodes, lexer) {
        // get the tag token
        var tok = parser.nextToken();

        // parse the args and move after the block end. passing true
        // as the second arg is required if there are no parentheses
        var args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // See above for notes about CallExtension
        return new nodes.CallExtensionAsync(this, 'run', args);
    };

    this.run = function(self, url, data, callback) {

        var ctx = self.ctx.ctx;
        if(!callback) callback = data;
        var tmp = url.split(':'), controller, action;

        if (tmp.length > 1) {

            controller = tmp[0];
            action = tmp[1];
        } else {
            controller = tmp[0];
            action = 'index';
        }

        runAction(ctx, controller, action)
            .then(() => {
                data = Object.assign(data || {}, ctx.renderInfo.data || {});
                app.render(ctx, `${controller}/${action}`, data).then((content) => {
                    callback(null, app.safeString(content));
                });
            });
    }
}

/**
 * 开始渲染流程
 * start render
*/
exports.start = async function (ctx, next) {

    const routeInfo = ctx.routeInfo, renderInfo = ctx.renderInfo;

    var mainViewData = renderInfo.data;

    if(!renderInfo) return await next();

    // render main view
    // 渲染模版
    const view = await tryRender(ctx, renderInfo.view, mainViewData);

    await runAction(ctx, 'layout', 'index');

    // 主视图中的数据会覆盖布局模版中同名的
    var data =  Object.assign(ctx.renderInfo.data, mainViewData, {
        view: safeString(view)
    });

    // render layout
    // 渲染Layout
    const layout = await tryRender(ctx, renderInfo.layout, data);

    ctx.body = layout;

    await next();
}

/**
 * 返回原样字符串，不会被模版引擎转义
 */
function safeString(string) {

    return env.getFilter('safe')(string);
}

/**
 * 渲染模版
 */
function tryRender(ctx, uri, data) {

    const suffix = settings.suffix || 'njk';
    const templatePath = uri + `.${suffix}`;
    var context = Object.assign({}, ctx.state || {}, data);
    context.ctx = ctx;

    return new Promise(function(reslove, reject) {

        env.render(templatePath, context, function(err, res) {

            if(!err) return reslove(res);
            reject(err);
        });
    });
}

/**
 * create Nunjucks's env
 */
function createEnv(path, options) {

    const autoescape = options.autoescape && true,
        noCache = options.noCache || false,
        watch = options.watch || false,
        throwOnUndefined = options.throwOnUndefined || false;

    return new nunjucks.Environment(new nunjucks.FileSystemLoader(path || 'views', {
        noCache: noCache,
        watch: watch,
    }), {
            autoescape: autoescape,
            throwOnUndefined: throwOnUndefined
        });
}

async function runAction(ctx, controller, action) {

    const Controller = app.controllers[controller];
    var func;

    if(typeof Controller == 'function') {

        func = Controller.prototype[action];
    }else{
        func = Controller[action];
    }

    // function is implicitly wrapped in Promise.resolve
    return func.call(ctx);
}

exports.level = 10;