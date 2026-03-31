import os

# === 1️⃣ 프로젝트 기본 폴더 구조 ===
folders = [
    "data_raw",
    "data_processed",
    "output",
    "logs"
]

for folder in folders:
    os.makedirs(folder, exist_ok=True)

# === 2️⃣ .env 파일 ===
env_content = """# 환경 변수 (.env)
LAW_API_KEY=여기에_법제처_API_KEY_입력
ASSEMBLY_API_KEY=여기에_국회_API_KEY_입력
"""

with open(".env", "w", encoding="utf-8") as f:
    f.write(env_content)

# === 3️⃣ requirements.txt ===
requirements = """requests
xmltodict
pandas
feedparser
beautifulsoup4
python-dotenv
"""

with open("requirements.txt", "w", encoding="utf-8") as f:
    f.write(requirements)

# === 4️⃣ 기본 수집 스크립트 ===
fetch_template = """import os, requests, xmltodict, json
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("LAW_API_KEY")

def fetch_gov_legislation_notice():
    url = f"https://www.law.go.kr/DRF/lawService.do?OC={API_KEY}&target=govLegislationNotice&type=XML"
    res = requests.get(url)
    data = xmltodict.parse(res.text)
    os.makedirs("data_raw", exist_ok=True)
    out_path = "data_raw/gov_legislation_notice.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 정부입법예고 목록 저장 완료 → {out_path}")

if __name__ == "__main__":
    fetch_gov_legislation_notice()
"""

with open("fetch_gov_legislation.py", "w", encoding="utf-8") as f:
    f.write(fetch_template)

# === 5️⃣ README.md ===
readme_content = """# 📘 Legiscope (입법·정책 데이터 트래커)

입법예고 → 법률안 발의 → 행정입법 → 정책집행 전 과정을 연결하여
산업별 입법 리스크 및 정책 수혜를 자동 분석하는 프로젝트.

## 📂 폴더 구조
- data_raw: 원본 데이터 (API 응답 저장)
- data_processed: 전처리 후 데이터
- output: 분석 결과 / 시각화 결과
- logs: 수집 로그 파일

## ⚙️ 주요 스크립트
- fetch_gov_legislation.py: 법제처 정부입법예고 데이터 수집
"""

with open("README.md", "w", encoding="utf-8") as f:
    f.write(readme_content)

print("✅ Legiscope 기본 구조 생성 완료!")
