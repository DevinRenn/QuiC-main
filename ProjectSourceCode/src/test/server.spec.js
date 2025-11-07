// ********************** Initialize server **********************************

const server = require('../../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const { assert, expect } = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************

describe('Test for GET /welcome:', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    chai
      .request(server)
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

const generateRandomString = (length) => {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

let randomUsername = generateRandomString(10);

describe('Test for POST /register:', () => {
  it('Positive: /register', done => {
    chai
      .request(server)
      .post('/register')
      .send({ username: randomUsername, password: 'testpassword' })
      .end((err, res) => {
        res.should.redirectTo(/\/login$/);
        done();
      });
  });
  it('Negative: /register. Checking invalid username.', done => {
    chai
      .request(server)
      .post('/register')
      .send({ username: randomUsername, password: 'testpassword' })
      .end((err, res) => {
        expect(res.text.toLowerCase()).to.include("username already exists");
        done();
      });
  });
});