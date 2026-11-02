import request from 'supertest'

import app from '../src/app'

describe('API guards', () => {
    test('health check', async () => {
        const response = await request(app).get('/health')

        expect(response.status).toBe(200)
    })

    test('unknown routes return the standard 404 body', async () => {
        const response = await request(app).get('/unknown')

        expect(response.status).toBe(404)
        expect(response.body.status).toBe(false)
    })

    test('protected routes need a token', async () => {
        const response = await request(app).get('/api/learn/assignments')

        expect(response.status).toBe(401)
        expect(response.body.data.code).toBe('TOKEN_MISSING')
    })

    test('invalid tokens are rejected', async () => {
        const response = await request(app).get('/api/home').set('Authorization', 'Bearer not-a-token')

        expect(response.status).toBe(401)
        expect(response.body.data.code).toBe('TOKEN_INVALID')
    })

    test('login validates the body', async () => {
        const response = await request(app).post('/api/auth/login').send({ identifier: '', password: '' })

        expect(response.status).toBe(400)
    })

    test('file links need a valid signature', async () => {
        const response = await request(app).get('/api/file/1?expires=1&signature=abc')

        expect(response.status).toBe(403)
    })
})
