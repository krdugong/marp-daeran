# 마프대란 알리미 트래커

서버 없이 굴러가는 마이프로틴 할인율 추적 사이트입니다.
기본 할인율은 자동 수집을 시도하고, 배너에 안 걸리는 숨은 할인은
직접 등록합니다. 둘을 합친 실질 할인율이 대란 판정 기준입니다.

## 파일 구조

    data/discount.json       유일한 원본 데이터
    admin.html                브라우저에서 데이터를 고치는 편집기
    scripts/collect.mjs       기본 할인율 자동 수집 시도 (하루 4회)
    scripts/build.mjs         JSON을 읽어 HTML 생성
    index.html                생성물. 직접 고치지 마십시오
    daeran.html                생성물. 직접 고치지 마십시오

## 깃허브에 올리는 법 (명령어 없이)

1. github.com 에서 New repository, 이름은 marp-daeran, Public 선택
2. Add file → Upload files 에서 이 폴더의 파일을 전부 끌어다 놓기
   (.github 폴더가 안 올라가면 Create new file 로 경로에
   `.github/workflows/track.yml` 을 직접 입력해 내용을 붙여넣기)
3. Settings → Actions → General → Workflow permissions 에서
   Read and write permissions 선택 후 저장
4. Settings → Pages 에서 Source 를 main 브랜치로 지정
5. 몇 분 뒤 https://krdugong.github.io/marp-daeran 에서 확인

## 배포 전 고칠 것

1. data/discount.json 의 예시 데이터를 실제 값으로 교체
   교체 전까지 페이지 위에 노란 경고가 표시됩니다
2. scripts/collect.mjs 의 SOURCE.url 과 pattern 을 확인합니다.
   `node scripts/collect.mjs --dry` 로 어떤 숫자가 잡히는지 먼저 확인하십시오.
   할인 표기가 상품 세일과 코드 할인이 섞여 나오는 경우가 많아
   엉뚱한 숫자를 집을 수 있습니다.
3. scripts/build.mjs 상단 SITE 값 확인 (naverVerify 만 서치어드바이저
   등록 후 채우면 됩니다. 나머지는 이미 채워져 있습니다)
4. 네이버 서치어드바이저와 구글 서치콘솔에 등록 후 sitemap.xml 제출

## 매일 쓰는 법

자동 수집이 잘 돌면 손댈 일이 거의 없습니다. 수집이 실패했거나
숨은 할인을 찾았을 때만 admin.html을 씁니다.

1. admin.html 을 브라우저로 엽니다
2. 기본 할인율이 자동으로 안 잡혔으면 직접 입력합니다.
   숨은 할인은 항상 여기서 등록합니다.
3. JSON 복사를 누릅니다
4. 깃허브에서 data/discount.json 을 열고 연필 아이콘, 전체 선택 후 붙여넣기
5. Commit changes 를 누르면 몇 분 뒤 사이트가 갱신됩니다

한 번 등록한 숨은 할인은 기간이 끝날 때까지 매일 자동으로 반영됩니다.

## 디자인 톤

배경은 흰색, 강조색은 마이프로틴과 같은 딥 틸(헤더·히어로 배경)과 오렌지
(할인율 강조·버튼)를 씁니다. 홈 상단 히어로 영역만 딥 틸 풀블리드 배경이고
나머지는 흰 배경입니다. 헤더 아래 얇은 정보 바(무료배송 기준·관세 기준·
추천코드)도 마이프로틴 톤을 참고해 넣었습니다.

## 유튜브 채널 홍보

모든 페이지에 마프대란알리미 유튜브 채널 구독 유도 카드가 들어갑니다.
검색이나 다른 경로로 처음 들어온 방문자에게 채널 존재를 알리기 위한
용도입니다. `scripts/build.mjs` 상단 `SITE.youtube` 값을 실제 채널
주소로 맞춰 두었는지 확인하십시오.

## 자동 수집에 대해

`scripts/collect.mjs`는 하루 4회 실행됩니다. 실패해도 페이지 생성은
계속됩니다(`continue-on-error`). 마이프로틴 페이지 구조가 바뀌면
정규식이 안 맞을 수 있으니, 값이 이상해 보이면 `--dry`로 먼저 확인하고
admin.html에서 직접 고치십시오. 숨은 할인은 배너에 안 걸리는 조건이라
애초에 자동으로 잡을 수 없어 항상 직접 등록해야 합니다.

## 명령어 (터미널을 쓸 경우)

    node scripts/collect.mjs --dry   수집 시험 실행, 저장하지 않음
    node scripts/collect.mjs 41      기본 할인율 41%로 수동 기록
    node scripts/collect.mjs         자동 수집 시도 후 기록
    node scripts/build.mjs           HTML 다시 생성

## 계산 방식

실질 할인율은 기본 할인 위에 숨은 할인을 쌓아 계산합니다.

    곱해서 적용:  1 - (1 - 기본) x (1 - 추가)
    단순 더하기:  기본 + 추가
