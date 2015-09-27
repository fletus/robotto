// jscs:disable maximumLineLength
'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const robotto = require('../src/robotto');
const fake = require('./fake');

let sandbox = sinon.sandbox.create();
let coolUrl = 'http://my-cool-domain.com/blog-post/1';
let coolRobot = 'http://my-cool-domain.com/robots.txt';

describe('robotto', () => {
    afterEach(() => {
        sandbox.restore();
    });

    describe('_getRobotsUrl', () => {
        it('returns robots.txt url for given host', () => {
            let robotsUrl = robotto._getRobotsUrl(coolUrl);
            assert.deepEqual(robotsUrl, coolRobot);
        });
    });

    describe('fetch', () => {
        beforeEach(() => {
            sandbox.spy(robotto, '_getRobotsUrl');
            sandbox.stub(robotto, '_request')
                .callsArgWith(1, null, fake.response(), fake.robots());
        });

        it('should not break if no callback is passed', () => {
            assert.doesNotThrow(() => {
                robotto.fetch(coolUrl);
            }, 'callback is not a function');
        });

        it('should call _getRobotsUrl', (done) => {
            robotto.fetch(coolUrl, () => {
                sinon.assert.calledWith(robotto._getRobotsUrl, coolUrl);
                done();
            });
        });

        it('should call _request', (done) => {
            robotto.fetch(coolUrl, () => {
                sinon.assert.calledWith(robotto._request, coolRobot);
                done();
            });
        });

        it('should callback with an error if request fails', (done) => {
            robotto._request.restore();
            sandbox.stub(robotto, '_request')
                .callsArgWith(1, new Error('fake request error'));

            robotto.fetch(coolUrl, (err) => {
                assert.deepEqual(err.message, 'fake request error');
                done();
            });
        });

        it('should callback with an error if status code is not 200', (done) => {
            robotto._request.restore();
            sandbox.stub(robotto, '_request')
                .callsArgWith(1, null, {statusCode: 404});

            robotto.fetch(coolUrl, (err) => {
                assert.deepEqual(err.message, `Could not fetch robots.txt from ${coolUrl}. Server response code: 404`);
                done();
            });
        });

        it('should callback with robots.txt content', (done) => {
            robotto.fetch(coolUrl, (err, robots) => {
                assert.notOk(err);
                assert.deepEqual(robots, fake.robots());
                done();
            });
        });
    });

    describe('parse', () => {
        it('should understand comments', () => {
            let robotsFile = [
                '# comment 1',
                'User-agent: 007 # comment 2'
            ].join('\n');
            let comments = ['comment 1', 'comment 2'];

            assert.deepEqual(robotto.parse(robotsFile).comments, comments);
        });

        it('should index by User-agent', () => {
            let robotsFile = [
                '# comment 1',
                'User-agent: 007 # comment 2',
                'Allow: /kill/',
                'User-agent: Agent 47',
                'Disallow: /nothing/'
            ].join('\n');

            assert.property(robotto.parse(robotsFile), '007');
            assert.property(robotto.parse(robotsFile), 'Agent 47');
        });

        it('should put allow entries in their respective User-agents', () => {
            let robotsFile = [
                '# comment 1',
                'User-agent: 007 # comment 2',
                'Allow: /kill/',
                'User-agent: Agent 47',
                'Allow: /everything/'
            ].join('\n');
            let rules = robotto.parse(robotsFile);

            assert.deepEqual(rules['007'].allow, ['/kill/']);
            assert.deepEqual(rules['Agent 47'].allow, ['/everything/']);
        });

        it('should put disallow entries in their respective User-agents', () => {
            let robotsFile = [
                '# comment 1',
                'User-agent: 007 # comment 2',
                'Disallow: /betrayal/',
                'User-agent: Agent 47',
                'Disallow: /nothing/'
            ].join('\n');
            let rules = robotto.parse(robotsFile);

            assert.deepEqual(rules['007'].disallow, ['/betrayal/']);
            assert.deepEqual(rules['Agent 47'].disallow, ['/nothing/']);
        });

        it('should actually parse a robots.txt file', () => {
            assert.deepEqual(robotto.parse(fake.robots()), fake.rules());
        });
    });

    describe('check', () => {
        it('should find a disallowed route for a specified agent', () => {
            let permission1 = robotto.check('007', 'http://secrets.com/admin/login', fake.rules());
            let permission2 = robotto.check('007', 'http://secrets.com/admin', fake.rules());

            assert.strictEqual(permission1, false);
            assert.strictEqual(permission2, false);
        });

        it('should find an allowed route for a specified agent', () => {
            let permission1 = robotto.check('007', 'http://secrets.com/blog-post/i-love-spies', fake.rules());
            let permission2 = robotto.check('007', 'http://secrets.com/blog-post', fake.rules());

            assert.strictEqual(permission1, true);
            assert.strictEqual(permission2, true);
        });

        it('should find a disallowed route for a non-specified agent', () => {
            let permission1 = robotto.check('NotKnownSpy', 'http://secrets.com/spies/daniel-craig', fake.rules());
            let permission2 = robotto.check('NotKnownSpy', 'http://secrets.com/spies', fake.rules());

            assert.strictEqual(permission1, false);
            assert.strictEqual(permission2, false);
        });

        it('should find an allowed route for a non-specified agent', () => {
            let permission1 = robotto.check('NotKnownSpy', 'http://secrets.com/love/pierce-brosnan', fake.rules());
            let permission2 = robotto.check('NotKnownSpy', 'http://secrets.com/love', fake.rules());

            assert.strictEqual(permission1, true);
            assert.strictEqual(permission2, true);
        });
    });
});
