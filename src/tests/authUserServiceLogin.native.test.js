import { describe, test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../controllers/authLogin.controller.new.js'
import { userService } from '../services/UserService.js';       
import { AppError } from '../framework/appError.js';            

describe('authLogin Controller', () => {
    let req;
    let res;
    let next;
    let originalLoginUser;

    beforeEach(() => {
        // save original method to call it again 
        originalLoginUser = userService.loginUser;
            userService.loginUser = mock.fn(() => Promise.resolve({}));

        // emmulation req 
        req = {
            body: {}
        };

        // add chaining res.json and .status 
        res = {
            status: mock.fn(() => res),
            json: mock.fn(() => res)
        };

        next = mock.fn();

        // reset calling 
        mock.reset();
    });

    afterEach(() => {
        // retrive original methods 
        userService.loginUser = originalLoginUser;
    });

    // =========================================================================
    // verify log in 
    // =========================================================================
    test('should successfully login and return 200 with user data and token', async () => {
        // incoming body contain email and password 
        req.body = {
            email: 'test@example.com',
            password: 'SecurePass123'
        };

        // mock json resutl 
        const mockServiceResult = {
            success: true,
            message: 'Login successfully',
            token: 'mocked_jwt_token',
            data: {
                id: 'user_123',
                username: 'testuser',
                email: 'test@example.com',
                role: 'MEMBER'
            }
        };

        userService.loginUser = mock.fn(() => Promise.resolve(mockServiceResult));

        
        await login(req, res, next);

        // calling to loginUser and with argument 0 = test@example.com' and 1 = 'SecurePass123'
        assert.strictEqual(userService.loginUser.mock.callCount(), 1);
        assert.strictEqual(
            userService.loginUser.mock.calls[0].arguments[0], 
            'test@example.com'
        );
        assert.strictEqual(
            userService.loginUser.mock.calls[0].arguments[1], 
            'SecurePass123'
        );

        // res call  with json and status code 200 
        assert.strictEqual(res.status.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
        
        assert.strictEqual(res.json.mock.callCount(), 1);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], mockServiceResult);

        // for success true the next not call 
        assert.strictEqual(next.mock.callCount(), 0);
    });

    // =========================================================================
    // failure email  (Validation Failure)
    // =========================================================================
    test('should throw AppError (400) if email is missing', async () => {
        req.body = { password: 'SecurePass123' }; 
 
        await login(req, res, next);

        // if email us missing this should not be call 
        assert.strictEqual(userService.loginUser.mock.callCount(), 0);

        // do to missing email then next with err are called with status code = 400 
        assert.strictEqual(next.mock.callCount(), 1);
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
        assert.strictEqual(
            errorPassedToNext.message, 
            "Validation Error: Please provide both Email and Password"
        );
    });

    test('should throw AppError (400) if password is missing', async () => {
        req.body = { email: 'test@example.com' }; 

        await login(req, res, next);
// same for password missing as email messing 
        assert.strictEqual(userService.loginUser.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 1);
        
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
    });

    test('should throw AppError (400) if req.body is missing entirely', async () => {
        req.body = undefined;

        await login(req, res, next);

        assert.strictEqual(userService.loginUser.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 1);
        
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
    });

    // =========================================================================
    // do login failure  (Service Failure)
    // =========================================================================
    test('should pass AppError (401) to next if userService.loginUser fails', async () => {
        req.body = {
            email: 'test@example.com',
            password: 'WrongPassword'
        };

        // mock loginUser the return failure result 
        const serviceError = new AppError("Authentication Error: Invalid Email or Password", 401);
        userService.loginUser = mock.fn(() => Promise.reject(serviceError));

        await login(req, res, next);

        // this call for one time and its failure 
        assert.strictEqual(userService.loginUser.mock.callCount(), 1);

        // next call with status call 401 
        assert.strictEqual(next.mock.callCount(), 1);
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 401);
        assert.strictEqual(
            errorPassedToNext.message, 
            "Authentication Error: Invalid Email or Password"
        );

        // res.status and . json not call 
        assert.strictEqual(res.status.mock.callCount(), 0);
        assert.strictEqual(res.json.mock.callCount(), 0);
    });
});