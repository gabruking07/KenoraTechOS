import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decryptMfaSecret, encryptMfaSecret, newTotpSecret, passwordIsStrong, recoveryCodeHash, safeEqualHash, tokenDigest, totp, verifyTotp } from '../../src/services/securityCrypto.js';
import { safeFilename, validateDocumentFile } from '../../src/services/fileSecurity.js';

const previousKey=process.env.MFA_ENCRYPTION_KEY;
const temporary:string[]=[];
afterEach(async()=>{await Promise.all(temporary.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));if(previousKey===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=previousKey});

describe('security primitives',()=>{
  it('encrypts MFA secrets at rest and validates current TOTP codes',()=>{
    process.env.MFA_ENCRYPTION_KEY='a'.repeat(64);const secret=newTotpSecret(),encrypted=encryptMfaSecret(secret),code=totp(secret);
    expect(encrypted).not.toContain(secret);expect(decryptMfaSecret(encrypted)).toBe(secret);expect(verifyTotp(secret,code)).toBe(true);expect(verifyTotp(secret,'000000')).toBe(false);
  });
  it('stores reset and recovery material as keyed digests and enforces password strength',()=>{
    process.env.MFA_ENCRYPTION_KEY='a'.repeat(64);
    const code='ABCDEF-123456';expect(recoveryCodeHash(code)).not.toContain(code);expect(safeEqualHash(code,recoveryCodeHash(code))).toBe(true);expect(safeEqualHash(code,recoveryCodeHash('wrong'))).toBe(false);
    expect(tokenDigest('reset-token-value')).not.toBe('reset-token-value');expect(passwordIsStrong('SecurePass123!')).toBe(true);expect(passwordIsStrong('password')).toBe(false);
  });
  it('sanitizes names and checks extension, MIME type, and file signatures',async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'kenora-file-security-'));temporary.push(dir);const valid=path.join(dir,'document.pdf'),fake=path.join(dir,'fake.pdf');
    await writeFile(valid,'%PDF-1.7\nprivate');await writeFile(fake,'not a PDF');
    expect(safeFilename('..\\..\\private.pdf')).toBe('private.pdf');
    expect((await validateDocumentFile({path:valid,originalname:'..\\private.pdf',mimetype:'application/pdf'})).name).toBe('private.pdf');
    await expect(validateDocumentFile({path:fake,originalname:'fake.pdf',mimetype:'application/pdf'})).rejects.toThrow('content');
    await expect(validateDocumentFile({path:valid,originalname:'fake.pdf',mimetype:'text/plain'})).rejects.toThrow('MIME');
  });
});
