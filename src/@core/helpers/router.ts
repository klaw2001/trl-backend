import express, { NextFunction, Request, Response } from 'express'

type Handler = (req: Request, res: Response, next: NextFunction) => any

// Forwards sync throws and async rejections to the express error handler
function wrap(handler: Handler) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(next)
    }
}

export function route() {
    const router = express.Router()

    function get(path: string, ...handlers: Handler[]) {
        router.get(path, ...handlers.map(wrap))
    }

    function post(path: string, ...handlers: Handler[]) {
        router.post(path, ...handlers.map(wrap))
    }

    return {
        get,
        post,
        router
    }
}
