const assert = require('assert');
const fs = require('fs');

const buyers = {
  digipay: {
    required: ['Current CRM Policy', 'one product', 'one cohort', 'QUOTE_NEEDS_INPUT', 'BUYER_INPUT_REQUIRED'],
    forbidden: ['DigiPay customer evidence', 'turnkey VPC deployment is supported']
  },
  miligold: {
    required: ['first purchase', 'second purchase', 'one cohort', 'QUOTE_NEEDS_INPUT', 'BUYER_INPUT_REQUIRED'],
    forbidden: ['MilliGold customer evidence', 'turnkey VPC deployment is supported']
  }
};

for (const [buyer, expectations] of Object.entries(buyers)) {
  const dir = `commercial/active-deals/${buyer}`;
  for (let i = 0; i <= 7; i += 1) {
    const prefix = String(i).padStart(2, '0');
    const file = fs.readdirSync(dir).find(name => name.startsWith(`${prefix}-`));
    assert(file, `${dir} missing ${prefix} artifact`);
    const text = fs.readFileSync(`${dir}/${file}`, 'utf8');
    assert(text.trim().length > 0, `${dir}/${file} must not be empty`);
  }
  const combined = fs.readdirSync(dir).map(name => fs.readFileSync(`${dir}/${name}`, 'utf8')).join('\n');
  for (const phrase of expectations.required) assert(combined.toLowerCase().includes(phrase.toLowerCase()), `${dir} missing ${phrase}`);
  for (const phrase of expectations.forbidden) assert(!combined.toLowerCase().includes(phrase.toLowerCase()), `${dir} contains forbidden phrase ${phrase}`);
  assert(combined.includes('INTERNAL WORKSPACE'), `${buyer} must be internal`);
  assert(combined.includes('No core product change'), `${buyer} must record no core product change`);
  assert(!/\b\d+(?:\.\d+)?%\b/.test(combined), `${buyer} must not invent results`);
  assert(!/customer[_ -]?id\s*[:=]\s*[^\[]/i.test(combined), `${buyer} must not include customer data`);
}
console.log('Active-deal activation workspaces and safety boundaries passed.');
