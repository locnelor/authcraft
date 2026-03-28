import express from 'express'
import { describe, test, expect } from "vitest"
import request from 'supertest'
import { Authcraft } from '../src/index.js'
describe("express adapter", () => {
    test("helloWorld", async () => {
        const app = express()
        const auth = new Authcraft()
        // const userAuth = auth.account("user")
        // 中间件
        app.use(Authcraft.expressMiddleware())


        // 检查是否登录
        app.get('/checkLogin', (req, res) => {
            auth.checkLogin()
            res.send('success')
        })

        // 登录
        app.get('/login', (req, res) => {
            auth.login(req.query.id as string)
            res.send('success')
        })

        // 退出登录
        app.get('/logout', (req, res) => {
            auth.logout()
            res.send('success')
        })


        // 添加权限
        // app.get('/addPermission', (req, res) => {
        //     auth.addPermission(req.query.permission as string)
        //     res.send('success')
        // })

        // 添加角色
        app.get('/addRole', (req, res) => {
            auth.addRole(req.query.role as string)
            res.send('success')
        })


        //  检查是否存在某某权限
        app.get('/permission', (req, res) => {
            auth.checkPermission("admin")
            res.send('success')
        })






        const res = await request(app).get('/hello')
        expect(res.status).toBe(200);
        expect(res.text).toBe("Hello World!")
    })
})