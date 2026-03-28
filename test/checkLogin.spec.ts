import express from 'express'
import { describe, test, expect } from "vitest"
import request from 'supertest'
import { Authcraft } from '../src/index.js'
describe("express adapter", () => {
    test("helloWorld", async () => {
        console.log('start')
        const app = express()
        const auth = new Authcraft()
        // 中间件
        app.use(Authcraft.expressMiddleware())
        // app.use((req, res, next) => { })


        // 检查是否登录
        app.get('/checkLogin', (req, res) => {
            auth.checkLogin()
            res.send('success')
        })

        // 登录
        app.get('/login', (req, res) => {
            auth.login(req.query.id as string)
            auth.checkLogin()
            res.send('success')
        })

        // 退出登录
        app.get('/logout', (req, res) => {
            auth.logout()
            res.send('success')
        })






        const res = await request(app).get('/hello')
        await request(app).get('/login?id=123')
        await request(app).get('/checkLogin')


        expect(res.status).toBe(200);
        console.log(res.text, 'res.text')
        expect(res.text).toBe("Hello World!")
    })
})