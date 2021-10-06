# Tests

Execute the commands in the root directory:

- `npm run test` will execute all main tests
- `npm run test-dos` will test against DoS; by measuring function formulas. **Takes ~1 hour**
- `npm run test-big` will execute hashing on 4GiB inputs,
  scrypt with 1024 different `N, r, p` combinations, etc. **Takes several hours**. Using 8+ core CPU helps.

## noble approach to testing

Hash function testing is tricky.

Obvious approach to test some random generated vectors against other library won't work well and is mostly useless.
This happens because hash compression is usually done in rounds and every bit of state in new round depends
on all bits from previous rounds, so even the smallest change in algo will completely change the output.

However, when hash function loop is manually unrolled, it is easy to make a mistake in the last round which will
only trigger in very rare cases. E.g. when not all state from the last round is used in output,
so the last round is unrolled to a different version than previous rounds.

To make sure hash function works correctly, we do chained hashing (`hash(hash(hash(....)))`) and compare against
OpenSSL (node.js built-ins), this ensures that compression function works well and is equal.

From our experience, most bugs in hashing libraries happen outside of the compression function,
inside block processing, where the code branches on length of user provided input.

Unfortunately, JS TypedArray.subarray is slow, so we need to calculate the offsets manually
(and it is easy to make "Off-by-one error" here). So, what we can do? Just test against all lengths that can trigger an error.
For all hash functions in this library blockLen is less than 256 bit. Which means we need to test two cases:
single update with variable length (0..4096) and multiple updates ([0..256], [0..256], [0..256]).

To sum it all up:

- No manual loop unrolling (generated by code is ok, but unfortunately not possible, see [README](../README.md))
- Chained tests (`hash(hash(hash(....)))`)
- Sliding windows tests:
  `hash([0]); hash([0, 1]); hash([0, 1, 2]); hash([0, 1, 2, 3]); ...`
  `hash().update([0]).update([1]).update([2, ...]); hash().update([0]).update([1, 2]).update([3, ...]); ...`

## Test vectors

- Blake2: https://github.com/BLAKE2/BLAKE2/tree/master/testvectors