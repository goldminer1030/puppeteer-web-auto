const puppeteer = require('puppeteer');
const TEST_MODE = false;
async function run() {
  return new Promise(async (resolve, reject) => {
    try {
      const browser = await puppeteer.launch({
        //setting path for use on FreeBSD
        // executablePath: '/usr/local/bin/chrome',
        ignoreHTTPSErrors: true,
        headless: true,
      })
      const api_key = "ztycfcgjvmeloqeadofkxuiy4nudqr21";
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.send('Network.clearBrowserCache');
      const looksSame = require('looks-same');
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setDefaultNavigationTimeout(20000);
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')
      await page.setRequestInterception(true);
      const waitForResponse = (page, url) => {
        return new Promise(resolve => {
          try {
            page.on("response", function callback(response) {
              if (response.url() === url) {
                resolve(response.json());
                page.removeListener("response", callback)
              }
            })
          } catch (e) {
            return reject(e);
          }
        })
      };

      //remove slow loading resources
      page.on('request', (req) => {
        if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'manifest' || req.resourceType() === 'media' || req.resourceType() === 'websocket' || req.resourceType() === 'other') {
          req.abort();
        } else {
          req.continue();
        }
      });

      //connect to Site
      await page.goto('https://www.att.com/prepaid/activations');

      if (TEST_MODE) {
        //take screenshot
        await page.screenshot({ path: 'loaded.png', fullPage: true });
      }

      //check if captcha is visible
      if ((await page.$('#captcha')) !== null) {
        if (TEST_MODE) {
          console.log("Captcha Exists");
        }
        captcha_text = '';

        // get captcha image
        await page.waitForXPath('//img[contains(@src,"/prepaid/activations/services/resources/acceptance/captcha/getImage?app=prepaid")]', 5000);
        const [captcha_image] = await page.$x('//img[contains(@src,"/prepaid/activations/services/resources/acceptance/captcha/getImage?app=prepaid")]');
        if (captcha_image) {
          var isPaused = true, isEmptyCaptcha = true;
          do {
            await captcha_image.screenshot({ path: "captcha.png" });

            // check if captcha is empty
            looksSame('captcha.png', 'empty.png', { strict: true }, function (error, { equal }) {
              isEmptyCaptcha = equal;
              isPaused = false;
            });

            if (isEmptyCaptcha) {
              // refresh captcha
              await page.waitForXPath('//img[contains(@src,"images/refresh-captcha.png")]', 5000);
              const [refresh_captcha] = await page.$x('//img[contains(@src,"images/refresh-captcha.png")]');
              if (refresh_captcha) {
                refresh_captcha.click();

                if (TEST_MODE) {
                  console.log('Clicked refresh captcha icon');
                }

                await page.waitFor(5000);

                if (TEST_MODE) {
                  console.log('Waited for 5 seconds');
                }
              } else {
                console.log("Can't find refresh captcha!!!");
              }

              if (TEST_MODE) {
                console.log('is paused? ' + isPaused);
                console.log('is empty captcha? ' + isEmptyCaptcha);
                //take screenshot
                await page.screenshot({ path: 'refresh-captcha.png', fullPage: true });
              }
            }
            await page.waitFor(500);
          } while (isPaused || isEmptyCaptcha);

          const b64string = await captcha_image.screenshot({ encoding: "base64" });
          const azcaptcha_api_in_page = await browser.newPage();

          await azcaptcha_api_in_page.setRequestInterception(true);

          // Request intercept handler... will be triggered with 
          // each azcaptcha_api_in_page.goto() statement
          azcaptcha_api_in_page.on('request', interceptedRequest => {
            var data = {
              'method': 'POST',
              'headers': {
                'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
              },
              'postData': "\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"key\"\r\n\r\n" + api_key +
                "\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"method\"\r\n\r\nbase64\r\n" +
                "------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"json\"\r\n\r\n1\r\n" +
                "------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name=\"body\"\r\n\r\n" + b64string +
                "\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--"
            };

            interceptedRequest.continue(data);
          });

          // Navigate, trigger the intercept, and resolve the response
          const response = await azcaptcha_api_in_page.goto('http://azcaptcha.com/in.php');
          const responseBody = await response.json();

          if (responseBody) {
            
            await page.waitFor(5000);

            const azcaptcha_api_res_page = await browser.newPage();
            azcaptcha_api_res_page.on('response', async response => {
              try {
                const status = response.status();
                const jsonResponse = await response.json();

                if (status == 200 && jsonResponse.status == 1) {
                  captcha_text = jsonResponse.request;

                  if (TEST_MODE) {
                    console.log('captcha text is: ' + captcha_text);
                  }
                }
              } catch (err) {
                console.error(err);
              }
            });
            await azcaptcha_api_res_page.goto('http://azcaptcha.com/res.php?key=' + api_key + '&action=get&json=1&id=' + responseBody.request);
            await azcaptcha_api_res_page.waitFor(5000);
            await azcaptcha_api_res_page.close();
          }
        } else {
          console.log('Could not get captcha image');
        }
        
        await page.type('#captcha', captcha_text);
      } else {
        if (TEST_MODE) {
          console.log("Captcha Not Required");
        }
      }

      await page.type('#simnumber', '89011325284987856487');
      await page.type('#imeinumber', '326548987889878');
      await page.type('#servicezip', '90210');

      if (TEST_MODE) {
        //take screenshot of filled inputs 
        await page.screenshot({ path: 'filled.png', fullPage: true });
      }

      //click Continue Button
      await page.click('button#continueBtn', { waitUntil: 'domcontentloaded' });

      //wait for response from specified script for #errorAlert
      const res = await waitForResponse(page, "https://www.att.com/prepaid/activations/services/resources/unauth/activation/inquireDeviceProfileDetails");

      if ((await page.$('#errorAlert')) !== null) {
        if(TEST_MODE) {
          console.log('Error Alert');
        }
      } else {
        if (TEST_MODE) {
          console.log('Could not find error alert');
        }
      }

      if (TEST_MODE) {
        //take screenshot after submitting
        await page.screenshot({ path: 'submitted.png', fullPage: true })
      }

      await browser.close();
      return resolve(res);
    } catch (e) {
      return reject(e);
    }
  })
}

function getDeveloperCodeFromResponse(response) {
  var messages;
  if ("InquireSIMStatusResponse" in response && "Result" in response['InquireSIMStatusResponse'] && 
    "Messages" in response['InquireSIMStatusResponse']['Result']) {
    messages = response['InquireSIMStatusResponse']['Result']['Messages'];
  } else if ("Result" in response && "Messages" in response['Result']) {
    messages = response['Result']['Messages'];
  }

  if (messages.length > 0 && "DeveloperCode" in messages[0]) {
    return messages[0]['DeveloperCode'];
  }

  return "NONE";
}

function runOnce() {
  run().then(response => {
    var responseCode = getDeveloperCodeFromResponse(response);
    
    if (responseCode === "GA701" || responseCode === "NONE") {
      runOnce();
    } else {
      console.log(response);
    }
  }).catch(function (error) {
    if (TEST_MODE) {
      console.log(error);
    }
    runOnce();
  });
}

runOnce();