// jscs:disable maximumLineLength
'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const request = require('request');
const robotto = require('../src/robotto');
const fake = require('./fake');

let sandbox = sinon.sandbox.create();
let coolUrl = 'http://my-cool-domain.com/blog-post/1';
let coolRobot = 'http://my-cool-domain.com/robots.txt';

describe('robotto', () => {
    afterEach(() => {
        sandbox.restore();
    });

    describe('getRobotsUrl', () => {
        it('returns robots.txt url for given host', () => {
            let robotsUrl = robotto.getRobotsUrl(coolUrl);
            assert.deepEqual(robotsUrl, coolRobot);
        });
    });

    describe('fetch', () => {
        beforeEach(() => {
            sandbox.spy(robotto, 'getRobotsUrl');
            sandbox.stub(request, 'get')
                .callsArgWith(1, null, fake.response(), fake.robots());
        });

        it('should not break if no callback is passed', () => {
            assert.doesNotThrow(() => {
                robotto.fetch(coolUrl);
            }, 'callback is not a function');
        });

        it('should call getRobotsUrl', (done) => {
            robotto.fetch(coolUrl, () => {
                sinon.assert.calledWith(robotto.getRobotsUrl, coolUrl);
                done();
            });
        });

        it('should call request.get', (done) => {
            robotto.fetch(coolUrl, () => {
                sinon.assert.calledWith(request.get, coolRobot);
                done();
            });
        });

        it('should callback with an error if request fails', (done) => {
            request.get.restore();
            sandbox.stub(request, 'get')
                .callsArgWith(1, new Error('fake request error'));

            robotto.fetch(coolUrl, (err) => {
                assert.deepEqual(err.message, 'fake request error');
                done();
            });
        });

        it('should callback with an error if status code is not 200', (done) => {
            request.get.restore();
            sandbox.stub(request, 'get')
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

            assert.property(robotto.parse(robotsFile).userAgents, '007');
            assert.property(robotto.parse(robotsFile).userAgents, 'Agent 47');
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

            assert.deepEqual(rules.userAgents['007'].allow, ['/kill/']);
            assert.deepEqual(rules.userAgents['Agent 47'].allow, ['/everything/']);
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

            assert.deepEqual(rules.userAgents['007'].disallow, ['/betrayal/']);
            assert.deepEqual(rules.userAgents['Agent 47'].disallow, ['/nothing/']);
        });

        it('should ignore unrecognized rules', () => {
            let robotsFile = [
                '# comment 1',
                'User-agent: 007 # comment 2',
                'Allow: /nice-cars/',
                'Disallow: /betrayal/',
                'Unknown: /unknown/',
                'User-agent: Agent 47',
                'Allow: /nice-games/',
                'Disallow: /nothing/',
                'Unknown: /unknown/'
            ].join('\n');

            let correctRulesObject = {
                comments: ['comment 1', 'comment 2'],
                userAgents: {
                    '007': {
                        allow: ['/nice-cars/'],
                        disallow: ['/betrayal/']
                    },
                    'Agent 47': {
                        allow: ['/nice-games/'],
                        disallow: ['/nothing/']
                    }
                }
            };

            let rules = robotto.parse(robotsFile);

            assert.deepEqual(rules, correctRulesObject);
        });

        it('should actually parse a robots.txt file', () => {
            assert.deepEqual(robotto.parse(fake.robots()), fake.rules());
        });
    });

    describe('getAllowDeepness', () => {
        it('should return the correct deepness for a specified route', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: [],
                        disallow: ['/']
                    },
                    '*': {
                        allow: ['/first/second/'],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.getAllowDeepness('UnknownAgent', '/first/second/', rules);
            assert.strictEqual(permission, 2);
        });

        it('should return the correct deepness for a specified route and user-agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: ['/one/two/three/'],
                        disallow: ['/']
                    },
                    '*': {
                        allow: ['/first/second/'],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.getAllowDeepness('007', '/one/two/three/', rules);
            assert.strictEqual(permission, 3);
        });

        it('should return 0 for a non-specified route', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: ['/one/two/three/'],
                        disallow: ['/']
                    },
                    '*': {
                        allow: ['/first/second/'],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.getAllowDeepness('007', '/does/not/exist/', rules);
            assert.strictEqual(permission, 0);
        });

        it('should return 0 for an incomplete match using a specified user-agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: ['/one/two/three/'],
                        disallow: ['/']
                    },
                    '*': {
                        allow: ['/first/second/'],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.getAllowDeepness('007', '/one/two/four/', rules);
            assert.strictEqual(permission, 0);
        });

        it('should return 0 when using unknown user-agent and there are no general rules', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: ['/one/two/three/'],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.getAllowDeepness('UnknownAgent', '/one/two/three/', rules);
            assert.strictEqual(permission, 0);
        });
    });

    describe('check', () => {
        it('should find a dgetAllowDeepness route for a specified agent', () => {
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

        it('should find a dgetAllowDeepness route for a non-specified agent', () => {
            let permission1 = robotto.check('NotKnownSpy', 'http://secrets.com/spies/daniel-craig', fake.rules());
            let permission2 = robotto.check('NotKnownSpy', 'http://secrets.com/spies', fake.rules());

            assert.strictEqual(permission1, false);
            assert.strictEqual(permission2, false);
        });

        it('should know every route is dgetAllowDeepness for a specified user agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '007': {
                        allow: [],
                        disallow: ['/']
                    }
                }
            };

            let permission = robotto.check('007', 'http://secrets.com/crazy-route/whatever', rules);
            assert.strictEqual(permission, false);
        });

        it('should know every route is dgetAllowDeepness for a non-specified user agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '*': {
                        allow: [],
                        disallow: ['/']
                    },
                    '007': {
                        allow: [],
                        disallow: ['/spies/']
                    }
                }
            };

            let permission = robotto.check('NotKnownSpy', 'http://secrets.com/crazy-route/whatever', rules);
            assert.strictEqual(permission, false);
        });

        it('should not match partial dgetAllowDeepness urls for specified user-agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '*': {
                        allow: [],
                        disallow: ['/love/']
                    },
                    '007': {
                        allow: [],
                        disallow: ['/spies/']
                    }
                }
            };

            let permission = robotto.check('007', 'http://secrets.com/spi', rules);
            assert.strictEqual(permission, true);
        });

        it('should not match partial dgetAllowDeepness urls for a non-specified user-agent', () => {
            let rules = {
                comments: ['comment 1'],
                userAgents: {
                    '*': {
                        allow: [],
                        disallow: ['/whatever/']
                    },
                    '007': {
                        allow: [],
                        disallow: ['/spies/']
                    }
                }
            };

            let permission = robotto.check('NotKnownSpy', 'http://secrets.com/what', rules);
            assert.strictEqual(permission, true);
        });
    });

    describe('canCrawl', () => {
        beforeEach(() => {
            sandbox.stub(robotto, 'fetch')
                .callsArgWith(1, null, fake.robots());
            sandbox.stub(robotto, 'parse').returns(fake.rules());
            sandbox.stub(robotto, 'check').returns(true);
        });

        it('should not break if no callback is passed', () => {
            assert.doesNotThrow(() => {
                robotto.canCrawl('007', coolUrl);
            }, 'callback is not a function');
        });

        it('should call fetch', (done) => {
            robotto.canCrawl('007', coolUrl, () => {
                sinon.assert.calledWith(robotto.fetch, coolUrl);
                done();
            });
        });

        it('should callback with an error if fetch fails', (done) => {
            robotto.fetch.restore();
            sandbox.stub(robotto, 'fetch')
                .callsArgWith(1, new Error('fake fetch error'));

            robotto.canCrawl('007', coolUrl, (err) => {
                assert.deepEqual(err.message, 'fake fetch error');
                done();
            });
        });

        it('should call parse', (done) => {
            robotto.canCrawl('007', coolUrl, () => {
                sinon.assert.calledWith(robotto.parse, fake.robots());
                done();
            });
        });

        it('should call check', (done) => {
            robotto.canCrawl('007', coolUrl, () => {
                sinon.assert.calledWith(robotto.check, '007', coolUrl, fake.rules());
                done();
            });
        });

        it('should call final callback', (done) => {
            robotto.canCrawl('007', coolUrl, (err, permission) => {
                assert.isNull(err);
                assert.isTrue(permission);
                done();
            });
        });
    });
});
