const nextButton = document.getElementById("next");
const backButton = document.getElementById("back");
const subSelect = document.getElementById("sub");
const img = document.getElementById("img");
const loading = document.getElementById("loading");

const LOADING_ERROR_URL =
  "https://jhusain.github.io/reddit-image-viewer/error.png";

const Observable = Rx.Observable;

// debugger;
// function which returns an array of image URLs for a given reddit sub
// getSubImages("pics") ->
// [
//   "https://upload.wikimedia.org/wikipedia/commons/3/36/Hopetoun_falls.jpg",
//   "https://upload.wikimedia.org/wikipedia/commons/3/38/4-Nature-Wallpapers-2014-1_ukaavUI.jpg",
//   ...
// ]
function getSubImages(sub) {
  console.log("getSubImages");
  const cachedImages = localStorage.getItem(sub);
  if (cachedImages) {
    console.log({ cachedImages });
    return Observable.of(JSON.parse(cachedImages));
  } else {
    const url = `https://www.reddit.com/r/${sub}/.json?limit=200&show=all`;

    // defer ensure new Observable (and therefore) promise gets created
    // for each subscription. This ensures functions like retry will
    // issue additional requests.
    return Observable.defer(() =>
      Observable.fromPromise(
        fetch(url, {
          method: "GET",
        })
          .then((res) => res.json())
          .then((data) => {
            const images = data.data.children.map((image) => image.data.url);
            console.log({ images });
            localStorage.setItem(sub, JSON.stringify(images));
            return images;
          })
          .catch((e) => {
            console.error("getSubImages error", e);
            throw Error(e);
          })
      )
    );
  }
}

// ---------------------- INSERT CODE  HERE ---------------------------
// This "images" Observable is a dummy. Replace it with a stream of each
// image in the current sub which is navigated by the user.

// user action streams
const backClick$ = Observable.fromEvent(backButton, "click");
const nextClick$ = Observable.fromEvent(nextButton, "click");
const subChange$ = Observable.fromEvent(subSelect, "change");

const sub$ = Observable.concat(
  Observable.of(subSelect.value),
  subChange$.map((e) => e.target.value)
);

// image navigations stream

/*
const images = Observable.of(
  "https://upload.wikimedia.org/wikipedia/commons/3/36/Hopetoun_falls.jpg"
);
*/

const imagePreload$ = (url) => {
  console.log("imagePreload$");
  return new Observable((observer) => {
    console.log("imagePreload$ observable", { url });
    const loaderImage = new Image();
    loaderImage.onerror = function (ev) {
      // image failed to load
      console.log("image load error", { url });
      observer.error(ev);
    };
    loaderImage.onload = function () {
      // image loaded successfully
      console.log("image loaded", { url });
      observer.next(url);
      observer.complete();
    };
    loaderImage.src = url;
    // observer.next(url);
    return () => console.log("unsub from imagePreload$");
  })
    .retry(2)
    .catch((e) => {
      console.log("image$ catch", { e });
      return Observable.of(fallbackUrl);
    });
};

const fallbackUrl = "https://jhusain.github.io/reddit-image-viewer/error.png";

const navigation$ = Observable.merge(
  backClick$.map((e) => -1),
  nextClick$.map((e) => 1),
  sub$.map((e) => 0)
);

const image$ = sub$
  .map((sub) => {
    console.log("sub$ map", { sub });
    return getSubImages(sub).retry(2);
  })
  .mergeAll();

const currentImage$ = Observable.combineLatest(navigation$, image$)
  .map(([navigationVal, images]) => {
    console.log({ navigationVal, images });
    return { navigationVal, images };
  })
  .scan(
    ({ index, images: oldImages }, current) => {
      const { navigationVal, images: newImages } = current;

      if (navigationVal === 0) {
        index = 0;
      } else {
        index += navigationVal;
      }

      // keep within array index limits
      index = Math.min(Math.max(index, 0), newImages.length);

      return { index, images: newImages };
    },
    { index: 0, images: [] }
  )
  .switchMap(({ index, images }) => {
    const url = images[index];

    console.log({ urlToLoad: url });

    return imagePreload$(url);
  });
// .switchLatest()
/*
  // preload images
  .map((imageUrls) => {
    // console.log("image$ map", { imageUrls });
    return Observable.merge(...imageUrls.map((url) => imagePreload$(url)));
  })
  .mergeAll();
  */
// .map((result1) => console.log({ result1 }))

currentImage$.subscribe({
  next(url) {
    // hide the loading image
    loading.style.visibility = "hidden";

    console.log("result", { loadedImage: url });

    // set Image source to URL
    img.src = url;
  },
  error(e) {
    const error =
      "I'm having trouble loading the images for that sub. Please wait a while, reload, and then try again later.";
    // alert(error);
    console.error("image$.subscribe", { error, e });
  },
});

// This "actions" Observable is a placeholder. Replace it with an
// observable that notfies whenever a user performs an action,
// like changing the sub or navigating the images

// each user action stream will start a new image load stream, and a loading placeholder should be shown, then when image is loaded, the placeholder should be hidden (which is done by the other stream)

const actions = Observable.merge(backClick$, nextClick$, subChange$);

actions.subscribe(() => {
  loading.style.visibility = "visible";
});
