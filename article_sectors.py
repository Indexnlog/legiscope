"""
시리즈 ②~⑥ 데이터 추출
"""
import csv, sys
sys.stdout.reconfigure(encoding='utf-8')

KSIC_L2 = {
    '582':'소프트웨어 개발·공급업', '620':'컴퓨터 프로그래밍·시스템통합',
    '631':'자료처리·호스팅·포털', '639':'기타 정보 서비스업',
    '611':'유선통신업', '612':'이동통신업', '613':'위성통신업', '619':'기타 통신업',
    '261':'반도체 제조업', '262':'전자부품 제조업', '263':'컴퓨터 제조업',
    '264':'통신·방송장비 제조업',
    '291':'자동차 제조업', '292':'자동차 부품 제조업',
    '201':'기초화학물질 제조업', '203':'합성수지 제조업', '204':'기타화학제품 제조업',
    '211':'의약품 제조업', '212':'의약외품 제조업', '324':'의료기기 제조업',
    '861':'병원', '862':'의원', '869':'기타 의료업',
    '351':'전기업', '352':'가스업', '360':'수도업',
    '381':'폐기물 수집운반업', '382':'폐기물 처리업',
    '410':'건물 건설업', '421':'도로·도시철도 건설업', '422':'수도·통신 건설업',
    '671':'부동산 임대업', '672':'부동산 개발·공급업', '673':'부동산 관련 서비스업',
}

SECTORS = {
    '② 디지털·AI': ['582', '620', '631', '639', '611', '612', '613', '619'],
    '③ 바이오·의료': ['211', '212', '324', '861', '862', '869'],
    '④ 에너지·환경': ['351', '352', '360', '381', '382'],
    '⑤ 부동산·건설': ['410', '421', '422', '671', '672', '673'],
    '⑥ 제조업': ['261', '262', '263', '264', '291', '292', '201', '203', '204'],
}

with open('output/bills_by_ksic.csv', encoding='utf-8-sig') as f:
    bills = list(csv.DictReader(f))

def get_sector_bills(prefixes):
    return [b for b in bills if b['ksic_code'][:3] in prefixes]

def summarize(sector_bills):
    total = len(set(b['bill_id'] for b in sector_bills))
    passed = len(set(b['bill_id'] for b in sector_bills if b['proc_result_cd'] in ('원안가결','수정가결')))
    reg = [b for b in sector_bills if b['regulation_type'] == '규제']
    reg_passed = [b for b in reg if b['proc_result_cd'] in ('원안가결','수정가결')]
    sup = [b for b in sector_bills if b['regulation_type'] == '지원']
    pending_reg = [b for b in reg if b['proc_result_cd'] not in ('원안가결','수정가결','임기만료폐기','폐기','철회')]
    return {
        'total': total, 'passed': passed,
        'reg': len(set(b['bill_id'] for b in reg)),
        'reg_passed': len(set(b['bill_id'] for b in reg_passed)),
        'support': len(set(b['bill_id'] for b in sup)),
        'pending_reg': len(set(b['bill_id'] for b in pending_reg)),
        'pass_rate': round(passed/total*100,1) if total else 0,
        'reg_ratio': round(len(reg)/total*100,1) if total else 0,
    }

for sector, prefixes in SECTORS.items():
    sb = get_sector_bills(prefixes)
    s = summarize(sb)
    print(f"\n{'='*65}")
    print(f"{sector}")
    print(f"{'='*65}")
    print(f"총 법안: {s['total']}건 | 가결: {s['passed']}건({s['pass_rate']}%) | 규제: {s['reg']}건({s['reg_ratio']}%) | 지원: {s['support']}건")
    print(f"규제 가결: {s['reg_passed']}건 | 규제 계류: {s['pending_reg']}건")

    # 가결된 규제법안 top5
    reg_pass = [b for b in sb if b['regulation_type']=='규제' and b['proc_result_cd'] in ('원안가결','수정가결')]
    reg_pass.sort(key=lambda x: x.get('proc_dt',''), reverse=True)
    seen = set()
    print("\n[규제 가결 TOP5]")
    for b in reg_pass:
        n = b['bill_name'][:50]
        if n in seen: continue
        seen.add(n)
        cat = KSIC_L2.get(b['ksic_code'][:3], b['ksic_code'][:3])
        print(f"  [{cat}] {b['bill_name'][:52]} | {b['proc_result_cd']} | {b['proc_dt']}")
        if len(seen) >= 5: break

    # 계류 중인 규제법안 top8
    pending = [b for b in sb if b['regulation_type']=='규제' and b['proc_result_cd'] not in ('원안가결','수정가결','임기만료폐기','폐기','철회')]
    pending.sort(key=lambda x: x.get('propose_dt',''), reverse=True)
    seen2 = set()
    print("\n[규제 계류 TOP8]")
    for b in pending:
        n = b['bill_name'][:50]
        if n in seen2: continue
        seen2.add(n)
        cat = KSIC_L2.get(b['ksic_code'][:3], b['ksic_code'][:3])
        print(f"  [{cat}] {b['bill_name'][:52]} | {b['committee'][:12]} | {b['propose_dt']}")
        if len(seen2) >= 8: break

    # 지원법안 가결 top3
    sup_pass = [b for b in sb if b['regulation_type']=='지원' and b['proc_result_cd'] in ('원안가결','수정가결')]
    sup_pass.sort(key=lambda x: x.get('proc_dt',''), reverse=True)
    seen3 = set()
    print("\n[지원 가결 TOP3]")
    for b in sup_pass:
        n = b['bill_name'][:50]
        if n in seen3: continue
        seen3.add(n)
        cat = KSIC_L2.get(b['ksic_code'][:3], b['ksic_code'][:3])
        print(f"  [{cat}] {b['bill_name'][:52]} | {b['proc_result_cd']} | {b['proc_dt']}")
        if len(seen3) >= 3: break
