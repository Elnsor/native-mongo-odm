import { describe, test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../controllers/auth.register.controller.new.js'
import { userService } from '../services/UserService.js';           
import { AppError } from '../framework/appError.js';                

describe('authRegister Controller', () => {
    let req;
    let res;
    let next;
    let originalRegisterUser;

    beforeEach(() => {
        
        originalRegisterUser = userService.registerUser;
   userService.registerUser = mock.fn(() => Promise.resolve({}));
        
        req = {
            body: {}
        };

        
        res = {
            status: mock.fn(() => res),
            json: mock.fn(() => res)
        };

        next = mock.fn();

        
        mock.reset();
    });

    afterEach(() => {
        
        userService.registerUser = originalRegisterUser;
    });

    
    
    
    test('should successfully register a new user and return 201 with data and token', async () => {
        
        req.body = {
            username: 'testuser',
            accountInfo: {
                email: 'test@example.com',
                password: 'SecurePass123',
                roleName: 'MEMBER'
            }
        };

        
        const mockServiceResult = {
            success: true,
            message: 'User registered successfully via framework pipeline',
            token: 'mocked_jwt_token',
            data: {
                id: 'new_user_id_123',
                username: 'testuser',
                email: 'test@example.com',
                role: 'MEMBER'
            }
        };

        userService.registerUser = mock.fn(() => Promise.resolve(mockServiceResult));

        
        await register(req, res, next);

        
        assert.strictEqual(userService.registerUser.mock.callCount(), 1);
        assert.deepStrictEqual(
            userService.registerUser.mock.calls[0].arguments[0], 
            req.body
        );

        
        assert.strictEqual(res.status.mock.callCount(), 1);
        assert.strictEqual(res.status.mock.calls[0].arguments[0], 201);
        
        assert.strictEqual(res.json.mock.callCount(), 1);
        assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], mockServiceResult);

        
        assert.strictEqual(next.mock.callCount(), 0);
    });

    
    
    
    test('should throw AppError (400) if req.body is missing entirely', async () => {
        req.body = undefined;

        await register(req, res, next);

        
        assert.strictEqual(userService.registerUser.mock.callCount(), 0);

        
        assert.strictEqual(next.mock.callCount(), 1);
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
        assert.strictEqual(
            errorPassedToNext.message, 
            "Validation Error: Password is required"
        );
    });

    test('should throw AppError (400) if accountInfo is missing', async () => {
        req.body = { username: 'testuser' }; 

        await register(req, res, next);

        assert.strictEqual(userService.registerUser.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 1);
        
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
    });

    test('should throw AppError (400) if password is missing inside accountInfo', async () => {
        req.body = { 
            username: 'testuser', 
            accountInfo: { email: 'test@example.com' } 
        };

        await register(req, res, next);

        assert.strictEqual(userService.registerUser.mock.callCount(), 0);
        assert.strictEqual(next.mock.callCount(), 1);
        
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
    });

    
    
    
    test('should pass AppError to next if userService.registerUser fails (e.g., email exists)', async () => {
        req.body = {
            username: 'testuser',
            accountInfo: {
                email: 'test@example.com',
                password: 'SecurePass123',
                roleName: 'MEMBER'
            }
        };

        
        const serviceError = new AppError("Validation Error: User with this email already exists", 400);
        userService.registerUser = mock.fn(() => Promise.reject(serviceError));

        await register(req, res, next);

        
        assert.strictEqual(userService.registerUser.mock.callCount(), 1);

        
        assert.strictEqual(next.mock.callCount(), 1);
        const errorPassedToNext = next.mock.calls[0].arguments[0];
        
        assert.ok(errorPassedToNext instanceof AppError);
        assert.strictEqual(errorPassedToNext.statusCode, 400);
        assert.strictEqual(
            errorPassedToNext.message, 
            "Validation Error: User with this email already exists"
        );

        
        assert.strictEqual(res.status.mock.callCount(), 0);
        assert.strictEqual(res.json.mock.callCount(), 0);
    });
});