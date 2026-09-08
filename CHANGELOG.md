# Changelog

## [3.0.0](https://github.com/chrispivonka/chrispivonka.com/compare/chrispivonka-com-v2.0.1...chrispivonka-com-v3.0.0) (2026-09-08)


### ⚠ BREAKING CHANGES

* release v2.0.0 — redesigned VS Code theme, persistent terminal split-pane, live SRE telemetry, floating nav window, and upgraded easter eggs

### Features

* **3dprinting:** add cloud connection mode, keeping the printer on Bambu Cloud ([bdf88ea](https://github.com/chrispivonka/chrispivonka.com/commit/bdf88ea885e27e1176d69fd855141d09bbc4aa83))
* **3dprinting:** add Google OAuth2 auth gate, matching kitty-cam ([f786c1b](https://github.com/chrispivonka/chrispivonka.com/commit/f786c1b09e341fbb7ac341f8d6bf77d9d1ec2c02))
* **3dprinting:** add print request queue with admin management ([c4a47a9](https://github.com/chrispivonka/chrispivonka.com/commit/c4a47a919a2ae545ddff9750c956622afa610857))
* **3dprinting:** stand up deployment infra and live Bambu Lab telemetry ([#91](https://github.com/chrispivonka/chrispivonka.com/issues/91)) ([e84d654](https://github.com/chrispivonka/chrispivonka.com/commit/e84d654b129e055dd2de99ea997226c9c9c4fb97))
* add authenticated kitty-cam page with oauth2-proxy ([64afcec](https://github.com/chrispivonka/chrispivonka.com/commit/64afcec8b0c54a4b5455f76b34b4eede536d2134))
* add LICENSE file and restore GitHub Pages deployment ([274017a](https://github.com/chrispivonka/chrispivonka.com/commit/274017abffc3be3d26fcc697dad408719df8c5df))
* add serverless kittycam infrastructure (Lambda@Edge + CloudFront + WAF) ([7af3314](https://github.com/chrispivonka/chrispivonka.com/commit/7af3314ad9da603505a0836182c523400e9d477a))
* add Smart Magic Mirror, Custom Wedding Platform, and 3D Printing project cards ([44285b5](https://github.com/chrispivonka/chrispivonka.com/commit/44285b57a4607c04737cc9711ba340fbd8c507de))
* add view_code() link to KittyCam project card pointing to subdomains/kittycam ([b8b0843](https://github.com/chrispivonka/chrispivonka.com/commit/b8b08433ac95ef95e571f4f1f63c3a29ccbe1d8d))
* add view_repo() links for wedding-website and MagicMirror repositories ([0b5b5f6](https://github.com/chrispivonka/chrispivonka.com/commit/0b5b5f69261a2ed63e949a8d5fb944748a301be0))
* add view_site() link for Custom Wedding Platform to https://chrisandjackie.co/ ([57eb96b](https://github.com/chrispivonka/chrispivonka.com/commit/57eb96bce425a19ec92aa14d2bf595be683a3e2c))
* **footer:** fetch dynamic semver release tag and format footer as &lt;semver&gt; · &lt;commit_sha&gt; ([4aa2e5e](https://github.com/chrispivonka/chrispivonka.com/commit/4aa2e5e40d7ad9a7738108112e10e0fc7aa81fc4))
* release v2.0.0 — redesigned VS Code theme, persistent terminal split-pane, live SRE telemetry, floating nav window, and upgraded easter eggs ([45ddc44](https://github.com/chrispivonka/chrispivonka.com/commit/45ddc44b66afaaeeb8599bc0b2be2fec6db315d3))
* replace commit age with real-time ticking container uptime counter ([58f5d05](https://github.com/chrispivonka/chrispivonka.com/commit/58f5d0549d05bc31a20c59c682a49be0af8939eb))
* update users.served metric to 10M+ and feature unlisted KittyCam streaming architecture project ([e24f84d](https://github.com/chrispivonka/chrispivonka.com/commit/e24f84d214f99d5bcd3e358fdc6356748659787a))


### Bug Fixes

* **3dprinting:** add version field to api Lambda package.json ([8989728](https://github.com/chrispivonka/chrispivonka.com/commit/898972830bd8358888ba5b83273746fd0008cc2d))
* **3dprinting:** bypass Cloudflare block on Bambu cloud login (error 1010) ([3ed9492](https://github.com/chrispivonka/chrispivonka.com/commit/3ed9492c78492fb7cbd10c00483c7dcb1c85151a))
* **3dprinting:** correct secrets region to us-west-2 ([18b1dae](https://github.com/chrispivonka/chrispivonka.com/commit/18b1dae7f92388a381b6fe023de661178c92021f))
* **3dprinting:** don't pass empty AlertEmail to sam deploy parameter-overrides ([129b779](https://github.com/chrispivonka/chrispivonka.com/commit/129b7795ec3800a9be7e35f4943c4515ec5ffad2))
* **3dprinting:** fix broken import map MIME type and missing font-src ([96752f4](https://github.com/chrispivonka/chrispivonka.com/commit/96752f4d596dde6bdc94c6f13ac9e0c5a303b4b3))
* **3dprinting:** grant deploy role access to SAM's managed bootstrap stack ([0cc1bf3](https://github.com/chrispivonka/chrispivonka.com/commit/0cc1bf3e1638a1a406726bae0e2c7dc7420c3c84))
* **3dprinting:** grant lambda:TagResource and iam role tag/list actions ([2968dfa](https://github.com/chrispivonka/chrispivonka.com/commit/2968dfa11f76e1edd5bd7fe7be0f9085dac56e6d))
* **3dprinting:** grant logs:CreateLogDelivery/DeleteLogDelivery for WAF logging ([23ce6f0](https://github.com/chrispivonka/chrispivonka.com/commit/23ce6f0583f45d14b732df9936010e6751e68128))
* **3dprinting:** grant logs:DescribeLogGroups on Resource "*" ([d6f1442](https://github.com/chrispivonka/chrispivonka.com/commit/d6f1442fbb4b156ef80ff537476dc7b3d5709933))
* **3dprinting:** grant s3:GetBucketAcl/PutBucketAcl for CloudFront logging ([c332f4b](https://github.com/chrispivonka/chrispivonka.com/commit/c332f4b2be9f0183540c282fc81d88eb0a267355))
* **3dprinting:** grant s3:PutBucketCORS/GetBucketCORS for the upload feature ([781b862](https://github.com/chrispivonka/chrispivonka.com/commit/781b8629bedabe29321b2f5c48897110271f24d9))
* **3dprinting:** limit request form material options to PLA/PETG ([60b6057](https://github.com/chrispivonka/chrispivonka.com/commit/60b6057e42422f1e7be98f9cd5d7d7bc308b49ef))
* **3dprinting:** rename CloudFormation stack to printing3d ([55cd6bb](https://github.com/chrispivonka/chrispivonka.com/commit/55cd6bbbe8b33004e2f37c48e8d54d574c306fe8))
* **3dprinting:** retry on empty-body Cloudflare responses during cloud login ([828499c](https://github.com/chrispivonka/chrispivonka.com/commit/828499c82556a9cd31bd51eed596528d97303925))
* **3dprinting:** revert to inline import map with CSP hash ([c827ec4](https://github.com/chrispivonka/chrispivonka.com/commit/c827ec4a2cb51a5ec4f6bf00967f203fe7949171))
* **3dprinting:** split WAF log resource-policy actions to Resource "*" ([85213c7](https://github.com/chrispivonka/chrispivonka.com/commit/85213c781c44b11d0ee643ce98032c9cfd4e427a))
* **3dprinting:** stop treating sendemail/code's empty success body as a failure ([57fe338](https://github.com/chrispivonka/chrispivonka.com/commit/57fe338a544fe3f88de83650be59da33c09c5701))
* **3dprinting:** use GetAtt for WAF log group ARN instead of hand-built strings ([56e996c](https://github.com/chrispivonka/chrispivonka.com/commit/56e996c8d7f477ea0b5d0d83c298c4e7cbd445ea))
* **a11y:** achieve 100/100 accessibility score, zero ESLint errors, and zero audit vulnerabilities ([b8e95d7](https://github.com/chrispivonka/chrispivonka.com/commit/b8e95d7e705c6f5364339aeee0afcd60d2573e55))
* add Google Fonts to CSP, whitelist S3 sync, upgrade deploy-pages ([b87a57c](https://github.com/chrispivonka/chrispivonka.com/commit/b87a57cde45fbcbb47723a8ba3e2675f08c16ed6))
* add manual navbar toggler handler for reliable mobile toggle ([0e29896](https://github.com/chrispivonka/chrispivonka.com/commit/0e2989621336536707c999eca0f4c9db66984280))
* add modal fallback, active nav links, HTML formatting, and test fixes ([d57abae](https://github.com/chrispivonka/chrispivonka.com/commit/d57abae72f4903330f5d6ed8d656e74f9d334f3b))
* allow Bootstrap Icons fonts in CSP, fix footer classes, init Bootstrap on dynamic elements ([14bebbf](https://github.com/chrispivonka/chrispivonka.com/commit/14bebbf7bc9c4d61965ee40a91bf1b155c96c70d))
* **ci:** migrate release-please to config file format ([37ef2f8](https://github.com/chrispivonka/chrispivonka.com/commit/37ef2f8a0bf0463dffcbfed932a724c371437822))
* **ci:** reduce Lighthouse flakiness in CI by using median of 3 runs ([a7f042f](https://github.com/chrispivonka/chrispivonka.com/commit/a7f042f81036061612a848de4b406218d0420a32))
* **ci:** remove deploy-pages job that breaks workflow validation ([594c6de](https://github.com/chrispivonka/chrispivonka.com/commit/594c6deb8721d45e3538d4273a0e7866f8342266))
* **ci:** resolve npm audit vulnerabilities, fix ESM jest test script, and hit 100/100 accessibility ([2893bc6](https://github.com/chrispivonka/chrispivonka.com/commit/2893bc6f4055957584b6e27f83e7769c19c55d16))
* **ci:** use env var for CloudFront secret check in deploy step ([42a70a7](https://github.com/chrispivonka/chrispivonka.com/commit/42a70a722930a33cbcfd123da0e31f7f5f55794f))
* **footer:** update static default and fallback for commit hash to v2.0.0 · main ([6fd2a17](https://github.com/chrispivonka/chrispivonka.com/commit/6fd2a1739895e9f94de3da199cbac4af9d45d439))
* Harden security posture for production deployment ([d949ff9](https://github.com/chrispivonka/chrispivonka.com/commit/d949ff9c634ee4c622c44906b0319f74dacc2064))
* load JS as ES modules and add browser fallbacks for npm packages ([7dbb7c2](https://github.com/chrispivonka/chrispivonka.com/commit/7dbb7c263b38c5f40b60eba23ce3a4d384e9a35f))
* **nav:** wire yellow/green traffic buttons, fix uptime committer date calculation, and update yearsOfExperience in config ([53e59b7](https://github.com/chrispivonka/chrispivonka.com/commit/53e59b77519cf58d8f45bce755dafd09b3a9113a))
* remove explicit Lambda function name to avoid replica conflicts ([d84be63](https://github.com/chrispivonka/chrispivonka.com/commit/d84be6377fb48b4674e0da4bcbda704e5bc4300f))
* remove inline styles/handlers blocked by CSP ([3a06e8e](https://github.com/chrispivonka/chrispivonka.com/commit/3a06e8e44bd3c59ea6e3f5328287a9d48e77112c))
* remove manual Bootstrap Collapse init that broke mobile hamburger ([3bcf30b](https://github.com/chrispivonka/chrispivonka.com/commit/3bcf30b5d92e9bbb409eaacd63d9290873ef753b))
* replace dots with hyphens in AWS resource names ([9c80d70](https://github.com/chrispivonka/chrispivonka.com/commit/9c80d70f076ceb0499e22163ef24e99b569125c7))
* resolve mobile hamburger menu and scroll-to-top issues ([e51d0e9](https://github.com/chrispivonka/chrispivonka.com/commit/e51d0e927cf7fa56beacb02d31210f83520ea7e8))
* rewrite kitty-cam nav links to point to main site ([3528071](https://github.com/chrispivonka/chrispivonka.com/commit/3528071e1899d44489c2af00e65ef94df5ac8b87))
* use styles.css instead of missing styles.min.css and fix Pages deploy permissions ([5bc30e8](https://github.com/chrispivonka/chrispivonka.com/commit/5bc30e8ba48268e99fb561f18880438777187828))


### Documentation

* Update Lighthouse thresholds and add DEPLOYMENT.md guide ([e5f3a75](https://github.com/chrispivonka/chrispivonka.com/commit/e5f3a75c391e983c3850d093dcf774cebd456c6e))

## [1.1.0](https://github.com/chrispivonka/chrispivonka.com/compare/chrispivonka-com-v1.0.0...chrispivonka-com-v1.1.0) (2026-03-15)


### Features

* add authenticated kitty-cam page with oauth2-proxy ([64afcec](https://github.com/chrispivonka/chrispivonka.com/commit/64afcec8b0c54a4b5455f76b34b4eede536d2134))
* add LICENSE file and restore GitHub Pages deployment ([274017a](https://github.com/chrispivonka/chrispivonka.com/commit/274017abffc3be3d26fcc697dad408719df8c5df))
* add serverless kittycam infrastructure (Lambda@Edge + CloudFront + WAF) ([7af3314](https://github.com/chrispivonka/chrispivonka.com/commit/7af3314ad9da603505a0836182c523400e9d477a))


### Bug Fixes

* add Google Fonts to CSP, whitelist S3 sync, upgrade deploy-pages ([b87a57c](https://github.com/chrispivonka/chrispivonka.com/commit/b87a57cde45fbcbb47723a8ba3e2675f08c16ed6))
* add manual navbar toggler handler for reliable mobile toggle ([0e29896](https://github.com/chrispivonka/chrispivonka.com/commit/0e2989621336536707c999eca0f4c9db66984280))
* add modal fallback, active nav links, HTML formatting, and test fixes ([d57abae](https://github.com/chrispivonka/chrispivonka.com/commit/d57abae72f4903330f5d6ed8d656e74f9d334f3b))
* allow Bootstrap Icons fonts in CSP, fix footer classes, init Bootstrap on dynamic elements ([14bebbf](https://github.com/chrispivonka/chrispivonka.com/commit/14bebbf7bc9c4d61965ee40a91bf1b155c96c70d))
* **ci:** migrate release-please to config file format ([37ef2f8](https://github.com/chrispivonka/chrispivonka.com/commit/37ef2f8a0bf0463dffcbfed932a724c371437822))
* **ci:** reduce Lighthouse flakiness in CI by using median of 3 runs ([a7f042f](https://github.com/chrispivonka/chrispivonka.com/commit/a7f042f81036061612a848de4b406218d0420a32))
* **ci:** remove deploy-pages job that breaks workflow validation ([594c6de](https://github.com/chrispivonka/chrispivonka.com/commit/594c6deb8721d45e3538d4273a0e7866f8342266))
* **ci:** use env var for CloudFront secret check in deploy step ([42a70a7](https://github.com/chrispivonka/chrispivonka.com/commit/42a70a722930a33cbcfd123da0e31f7f5f55794f))
* Harden security posture for production deployment ([d949ff9](https://github.com/chrispivonka/chrispivonka.com/commit/d949ff9c634ee4c622c44906b0319f74dacc2064))
* load JS as ES modules and add browser fallbacks for npm packages ([7dbb7c2](https://github.com/chrispivonka/chrispivonka.com/commit/7dbb7c263b38c5f40b60eba23ce3a4d384e9a35f))
* remove explicit Lambda function name to avoid replica conflicts ([d84be63](https://github.com/chrispivonka/chrispivonka.com/commit/d84be6377fb48b4674e0da4bcbda704e5bc4300f))
* remove inline styles/handlers blocked by CSP ([3a06e8e](https://github.com/chrispivonka/chrispivonka.com/commit/3a06e8e44bd3c59ea6e3f5328287a9d48e77112c))
* remove manual Bootstrap Collapse init that broke mobile hamburger ([3bcf30b](https://github.com/chrispivonka/chrispivonka.com/commit/3bcf30b5d92e9bbb409eaacd63d9290873ef753b))
* replace dots with hyphens in AWS resource names ([9c80d70](https://github.com/chrispivonka/chrispivonka.com/commit/9c80d70f076ceb0499e22163ef24e99b569125c7))
* resolve mobile hamburger menu and scroll-to-top issues ([e51d0e9](https://github.com/chrispivonka/chrispivonka.com/commit/e51d0e927cf7fa56beacb02d31210f83520ea7e8))
* rewrite kitty-cam nav links to point to main site ([3528071](https://github.com/chrispivonka/chrispivonka.com/commit/3528071e1899d44489c2af00e65ef94df5ac8b87))
* use styles.css instead of missing styles.min.css and fix Pages deploy permissions ([5bc30e8](https://github.com/chrispivonka/chrispivonka.com/commit/5bc30e8ba48268e99fb561f18880438777187828))


### Documentation

* Update Lighthouse thresholds and add DEPLOYMENT.md guide ([e5f3a75](https://github.com/chrispivonka/chrispivonka.com/commit/e5f3a75c391e983c3850d093dcf774cebd456c6e))

## 1.0.0 (2026-02-19)


### Bug Fixes

* Harden security posture for production deployment ([d949ff9](https://github.com/chrispivonka/chrispivonka.com/commit/d949ff9c634ee4c622c44906b0319f74dacc2064))
