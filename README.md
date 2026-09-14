# 마프대란 알리미 트래커

서버 없이 굴러가는 마이프로틴 할인율 추적 사이트입니다.
공개된 기본 할인율은 자동으로 모으고, 숨은 추가 할인은 직접 등록합니다.
둘을 합친 실질 할인율이 사이트 전체에 반영됩니다.

## 파일 구조

    data/discount.json     유일한 원본 데이터
    admin.html             브라우저에서 데이터를 고치는 편집기
    scripts/collect.mjs    기본 할인율 자동 수집 (하루 4회)
    scripts/build.mjs      JSON을 읽어 HTML 생성
    index.html             생성물. 직접 고치지 마십시오
    daeran.html            생성물. 직접 고치지 마십시오

## 깃허브에 올리는 법 (명령어 없이)

1. github.com 에서 New repository, 이름은 marp-daeran, Public 선택
2. Add file → Upload files 에서 이 폴더의 파일을 전부 끌어다 놓기
   (.github 폴더가 안 올라가면 Create new file 로 경로에
   `.github/workflows/track.yml` 을 직접 입력해 내용을 붙여넣기)
3. Settings → Actions → General → Workflow permissions 에서
   Read and write permissions 선택 후 저장
4. Settings → Pages 에서 Source 를 main 브랜치로 지정
5. 몇 분 뒤 https://아이디.github.io/marp-daeran 에서 확인

## 배포 전 고칠 것

1. scripts/build.mjs 맨 위 SITE 값 네 개
   origin, kakao, affiliate, naverVerify
2. data/discount.json 의 예시 데이터를 실제 값으로 교체
   교체 전까지 페이지 위에 노란 경고가 표시됩니다
3. robots.txt 의 사이트맵 주소
4. 네이버 서치어드바이저와 구글 서치콘솔에 등록 후 sitemap.xml 제출

## 매일 쓰는 법

숨은 할인을 찾았거나 할인율을 직접 고칠 때:

1. admin.html 을 브라우저로 엽니다
2. 값을 입력하면 실질 할인율이 바로 계산됩니다
3. JSON 복사를 누릅니다
4. 깃허브에서 data/discount.json 을 열고 연필 아이콘, 전체 선택 후 붙여넣기
5. Commit changes 를 누르면 몇 분 뒤 사이트가 갱신됩니다

한 번 등록한 숨은 할인은 기간이 끝날 때까지 매일 자동으로 반영됩니다.
매일 손댈 필요가 없습니다.

## 명령어 (터미널을 쓸 경우)

    node scripts/collect.mjs --dry   수집 시험 실행, 저장하지 않음
    node scripts/collect.mjs 41      기본 할인율 41%로 수동 기록
    node scripts/collect.mjs         자동 수집 후 기록
    node scripts/build.mjs           HTML 다시 생성

## 계산 방식

실질 할인율은 기본 할인 위에 숨은 할인을 쌓아 계산합니다.

    곱해서 적용:  1 - (1 - 기본) x (1 - 추가)
    단순 더하기:  기본 + 추가

기본 37%에 8% 추가 할인을 곱해서 적용하면 42.04%가 됩니다.
실제 마이프로틴이 어느 방식으로 계산하는지는 조건마다 다르므로,
장바구니에서 실제 금액을 확인한 뒤 방식을 정하십시오.
