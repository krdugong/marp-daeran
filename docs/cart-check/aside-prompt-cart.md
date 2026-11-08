마이프로틴 한국 사이트(https://www.myprotein.co.kr/)에서 할인코드 두 개를 장바구니에 직접 넣어 비교해 주세요. 절대 결제·주문하지 마세요. 비밀번호 입력, 회원가입, 캡차 우회도 하지 마세요. 캡차나 로그인 요구가 나오면 거기서 멈추고 그 사실을 note 에 적어 주세요.

1. 메인 페이지 상단 배너에서 지금 공식 할인코드 이름과 할인율을 읽어 주세요(예: "할인코드: SUPER35", "추가 35%"). 이것이 "공식 코드"입니다.
2. 장바구니에 아래 제품을 하나씩 담아 주세요(맛은 아무거나, 품절이면 다른 맛):
   - 임팩트웨이 프로틴 1kg  https://www.myprotein.co.kr/p/sports-nutrition/impact-whey-protein-powder/10530943/
   - 임팩트웨이 아이솔레이트 1kg  https://www.myprotein.co.kr/p/sports-nutrition/impact-whey-isolate/10530911/
   - 임팩트 크레아틴 250g  https://www.myprotein.co.kr/p/sports-nutrition/creatine-monohydrate/10530050/
   장바구니에 원래 다른 상품이 있었다면 지우지 말고, 그 상품 목록을 note 에 적은 뒤 비교에서는 이 세 제품 줄만 봐 주세요.
3. 장바구니에서 할인코드 HORSEKING 을 넣고, 제품별 할인 후 금액, 할인 금액, 총액을 적어 주세요. 오류 메시지가 나오면 그대로 적어 주세요.
4. HORSEKING 을 지우고 공식 코드를 넣어 같은 값을 적어 주세요.
5. 끝나면 내가 담은 세 제품을 장바구니에서 빼 주세요(원래 있던 상품은 그대로).

결과는 JSON만 돌려주세요(설명 없이). 못 본 값은 null, 이유는 note 에:
{
  "checkedAt": "YYYY-MM-DD HH:MM (한국시각)",
  "officialCode": "SUPER35", "officialBannerRate": 35,
  "items": [{"name":"", "size":"", "flavor":"", "listPrice":0, "salePriceBeforeCode":0}],
  "codes": {
    "HORSEKING": {"applied": true, "error": null, "lines": [{"name":"", "after":0}], "discount":0, "subtotal":0, "total":0, "ratePct": 0},
    "OFFICIAL": {"code":"SUPER35", "applied": true, "error": null, "lines": [{"name":"", "after":0}], "discount":0, "subtotal":0, "total":0, "ratePct": 0}
  },
  "loggedIn": true,
  "note": ""
}
ratePct 는 (할인 금액 ÷ 코드 넣기 전 소계 × 100)을 소수 첫째 자리까지.
