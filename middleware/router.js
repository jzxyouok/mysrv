const router = require('koa-router')();
const fs = require('fs'), path = require('path');
const render = require('./render');

var app, settings, controllers;

exports = module.exports = router.routes();

exports.startup = function(_app) {

    app = _app;settings = app.settings;
    controllers = loadController();
    app.controllers = app.server.context.controllers = controllers;

    for(let name in controllers) route(name);
}

/**
 * 加载 Controller
 */
function loadController() {

    const controllerDir = path.join(settings.appDir, 'components/controllers');
    if(!fs.existsSync(controllerDir)) return [];
    const maybe = fs.readdirSync(controllerDir);
    const controllers = {};

    for(let i in maybe) {

        const fileName = maybe[i];
        const controllerName = fileName.replace('.js', '');
        const Controller = require(path.join(controllerDir, fileName));
        controllers[controllerName] = Controller;
    }

    return controllers;
}

/**
 * 建立路由
 */
function route(controllerName) {

    const Controller = controllers[controllerName];

    const props = typeof Controller == 'function' ?
        Object.getOwnPropertyNames(Controller.prototype) : Object.keys(Controller);

    for (let prop of props) {

        const action = typeof Controller == 'function' ? Controller.prototype[prop] : Controller[prop];
        if (prop == 'constructor' || ('function' != (typeof action))) continue;
        const actionName = prop, conf = getHint(action);

        // 默认处理所有method类型
        var method = 'all', url = '';
        method = conf['method'] ? conf['method'] : method;

        if (conf['url']) {

            let tmp = conf['url'].split(' ');
            // GET /url 
            if (tmp.length > 1) {

                method = tmp[0];
                url = tmp[1];
            } else {
                url = conf['url'];
            }
        }

        // 没有配置路由，采用默认映射关系
        if(!url) {

            if(actionName == 'index') {

                url = `/${controllerName}`;
                if(controllerName == 'index') url = '/';
            }else{
                url = `/${controllerName}/${actionName}`;
            }
        }

        method = method.toLowerCase();

        router[method](url, async function(ctx, next) {

            ctx.params = Object.assign(ctx.query, ctx.request.body || {});
            
            ctx.routeInfo = {
                controller: controllerName,
                action: actionName
            }

            for(let name in app.context.services) ctx[name] = app.context.services[name];
            await action.call(ctx);
            await next();

        }, render.start);
    }
}

/**
 * 从Contoller的默认参数中，获取URL配置信息。类似于Java注解，例如：
 * 
 * function(arg, $url = '/', $method = 'GET') { ... }
 * 
 * $url 为映射的URL路径, $method 为接受的请求类型
 */
function getHint(fn) {

    var str = fn.toString();
    var args = fn.toString().slice(str.indexOf('(') + 1, str.indexOf(')')).split(',');
    if (!args) { return null }

    var result = {};

    for (let i of args) {

        i = i.trim();
        if (i.startsWith(settings.hintSign)) {

            let tmp = i.split('=');
            let name = tmp[0].trim().replace(settings.hintSign, '').toLowerCase();
            let value = tmp[1].trim().replace(/'/g, '').replace(/"/g, '');
            result[name] = value;
        }
    }

    return result;
}