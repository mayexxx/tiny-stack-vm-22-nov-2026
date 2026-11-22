import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Each descriptor gives immediate bytes, stack inputs and stack outputs.
const ops = new Map();
function define(codes, immediate, inputs, outputs) {
  for (const code of codes) ops.set(code, [immediate, inputs, outputs]);
}
define([0, 0x34], 0, 0, 0);
define([1], 1, 0, 1); define([2], 4, 0, 1);
define([3, 0x50, 0x51, 0x53], 0, 1, 0);
define([4], 0, 1, 2); define([5], 0, 2, 2);
define([6], 0, 2, 3); define([7], 0, 3, 3);
define([0x10,0x11,0x12,0x13,0x14,0x15,0x16,0x18,0x19,0x1a,0x1c,0x1d,0x1e,0x20,0x21,0x22], 0, 2, 1);
define([0x17,0x1b,0x40], 0, 1, 1);
define([0x30,0x33], 2, 0, 0); define([0x31,0x32], 2, 1, 0);
define([0x41], 0, 2, 0); define([0x52], 0, 0, 1);

function execute(program, input) {
  const stack = [], calls = [], memory = new Int32Array(256), out = Buffer.alloc(65536);
  let pc = 0, pos = 0, length = 0, steps = 0, code = 0;
  while (true) {
    if (steps === 1000000) { code = 10; break; }
    if (pc < 0 || pc >= program.length) { code = 9; break; }
    const op = program[pc], spec = ops.get(op);
    if (!spec) { code = 5; break; }
    const [imm, pop, push] = spec;
    if (pc + imm >= program.length) { code = 9; break; }
    steps++;
    if (stack.length < pop) { code = 2; break; }
    if (stack.length - pop + push > 256) { code = 3; break; }
    const at = pc + 1;
    pc += 1 + imm;
    const n = stack.length;
    let a, b, value;
    if ((op >= 0x10 && op <= 0x16) || (op >= 0x18 && op <= 0x1a) || (op >= 0x1c && op <= 0x1e) || (op >= 0x20 && op <= 0x22)) {
      b = stack[n - 1]; a = stack[n - 2];
      if (op >= 0x13 && op <= 0x16 && b === 0) { code = 4; break; }
      switch (op) {
        case 0x10: value = a + b; break;
        case 0x11: value = a - b; break;
        case 0x12: value = Math.imul(a, b); break;
        case 0x13: value = a / b; break;
        case 0x14: value = a % b; break;
        case 0x15: value = (a >>> 0) / (b >>> 0); break;
        case 0x16: value = (a >>> 0) % (b >>> 0); break;
        case 0x18: value = a & b; break;
        case 0x19: value = a | b; break;
        case 0x1a: value = a ^ b; break;
        case 0x1c: value = a << b; break;
        case 0x1d: value = a >> b; break;
        case 0x1e: value = a >>> b; break;
        case 0x20: value = +(a === b); break;
        case 0x21: value = +(a < b); break;
        case 0x22: value = +((a >>> 0) < (b >>> 0)); break;
      }
      stack.length -= 2; stack.push(value | 0); continue;
    }
    switch (op) {
      case 0: return { out: out.subarray(0, length), code: 0 };
      case 1: stack.push((program[at] << 24) >> 24); break;
      case 2: stack.push(program.readInt32LE(at)); break;
      case 3: stack.pop(); break;
      case 4: stack.push(stack[n - 1]); break;
      case 5: a = stack[n - 1]; stack[n - 1] = stack[n - 2]; stack[n - 2] = a; break;
      case 6: stack.push(stack[n - 2]); break;
      case 7: a = stack[n - 3]; stack[n - 3] = stack[n - 2]; stack[n - 2] = stack[n - 1]; stack[n - 1] = a; break;
      case 0x17: stack[n - 1] = -stack[n - 1] | 0; break;
      case 0x1b: stack[n - 1] = ~stack[n - 1]; break;
      case 0x30: case 0x31: case 0x32:
        if (op === 0x30 || (op === 0x31 ? stack.pop() === 0 : stack.pop() !== 0)) pc += program.readInt16LE(at);
        break;
      case 0x33:
        if (calls.length === 64) { code = 7; break; }
        calls.push(pc); pc = program.readUInt16LE(at); break;
      case 0x34:
        if (!calls.length) { code = 8; break; }
        pc = calls.pop(); break;
      case 0x40: case 0x41:
        a = stack[n - 1];
        if (a < 0 || a >= 256) { code = 6; break; }
        if (op === 0x40) stack[n - 1] = memory[a];
        else { stack.pop(); memory[a] = stack.pop(); }
        break;
      case 0x50:
        value = String(stack[n - 1]);
        if (length + value.length > 65536) { code = 11; break; }
        stack.pop(); out.write(value, length, 'ascii'); length += value.length; break;
      case 0x51:
        if (length === 65536) { code = 11; break; }
        out[length++] = stack.pop() & 255; break;
      case 0x52: stack.push(pos < input.length ? input[pos++] : -1); break;
      case 0x53: return { out: out.subarray(0, length), code: stack.pop() & 255 };
    }
    if (code) break;
  }
  return { out: out.subarray(0, length), code };
}

const source = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const target = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(source).sort()) {
  const result = execute(readFileSync(join(source, id, 'program.bin')), readFileSync(join(source, id, 'input.bin')));
  const dir = join(target, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stdout.bin'), result.out);
  writeFileSync(join(dir, 'exit.txt'), String(result.code) + '\n');
}
