import os, requests, xmltodict, json
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
