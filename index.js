const nextButton = document.getElementById("next");
const backButton = document.getElementById("back");
const subSelect = document.getElementById("sub");
const img = document.getElementById("img");
const loading = document.getElementById("loading");
const counter = document.getElementById("counter");

const LOADING_ERROR_URL =
  "https://jhusain.github.io/reddit-image-viewer/error.png";

const Observable = Rx.Observable;
// debugger;
// debugger;
// function which returns an array of image URLs for a given reddit sub
// getSubImages("pics") ->
// [
//   "https://upload.wikimedia.org/wikipedia/commons/3/36/Hopetoun_falls.jpg",
//   "https://upload.wikimedia.org/wikipedia/commons/3/38/4-Nature-Wallpapers-2014-1_ukaavUI.jpg",
//   ...
// ]
function getSubImages(sub) {
  console.warn("getSubImages");
  const cachedImages = localStorage.getItem(sub);
  if (cachedImages) {
    // console.log({ cachedImages });
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
const backClick$ = Observable.fromEvent(backButton, "click").do(() =>
  console.log("backClick$")
);
const nextClick$ = Observable.fromEvent(nextButton, "click");
const subChange$ = Observable.fromEvent(subSelect, "change")
  .do(() => console.warn("subChange$"))
  .share();

/** stream of sub name changes with initial sub name */
const subNameChange$ = Observable.concat(
  Observable.of(subSelect.value),
  subChange$.map((e) => e.target.value)
);

/*
const images = Observable.of(
  "https://upload.wikimedia.org/wikipedia/commons/3/36/Hopetoun_falls.jpg"
);
*/

/** Fallback if image could not be loaded */
const fallbackUrl = "https://jhusain.github.io/reddit-image-viewer/error.png";

/** Util to create an image preload observable */
const imagePreload$ = (url) => {
  // console.log("imagePreload$");
  return (
    new Observable((observer) => {
      console.log("imagePreload$ observable", { url });
      const loaderImage = new Image();
      loaderImage.onerror = function (ev) {
        // image failed to load
        console.log("image load error", { url, ev });
        observer.error(ev);
      };
      loaderImage.onload = function () {
        // image loaded successfully
        // console.log("image loaded", { url });
        observer.next(url);
        observer.complete();
      };
      loaderImage.src = url;
      // observer.next(url);
      return () => {
        // stops image loading and removes listeners
        loaderImage.onerror = null;
        loaderImage.onload = null;
        loaderImage.src = "";
        console.log("unsubscribed from imagePreload$", { url });
      };
    })
      // .retry(2)
      .catch((e) => {
        /*
        console.log("imagePreload$ error preloading image", { url });
        */
        return Observable.of(fallbackUrl);
      })
  );
};

/** Actions translated to integer codes */
const navigationActionChangeCodes$ = Observable.merge(
  backClick$.map((e) => -1),
  nextClick$.map((e) => 1),
  subNameChange$.map((e) => 0)
);

/** API call to get image url array */
const imageListLoad$ = subNameChange$.switchMap((sub) => {
  // console.log("sub$ map", { sub });
  return getSubImages(sub).retry(3);
});

/** Stream of image changes */
const currentImageChange$ = Observable.combineLatest(
  navigationActionChangeCodes$,
  imageListLoad$,
  subNameChange$
)
  .do(() => console.log("---------------------"))
  .map(([actionVal, images, sub]) => {
    // console.log({ actionVal, images });
    return { navigationVal: actionVal, images, sub };
  })
  .scan(
    ({ index: oldIndex, images: oldImages, sub: oldSub }, current) => {
      const { navigationVal, images: newImages, sub } = current;

      const initialIndex = 0;

      const boundIndexToLimits = (newIndex) =>
        Math.min(Math.max(newIndex, 0), newImages.length - 1);

      // new index, if it is 0 then this means go to initial index
      const index = navigationVal
        ? boundIndexToLimits(navigationVal + oldIndex)
        : initialIndex;

      // defines if there has been a change that means the image will change
      const hasChange = oldIndex !== index || oldSub !== sub;

      return {
        index,
        sub,
        images: [...newImages],
        hasChange,
      };
    },
    {
      index: undefined,
      images: undefined,
      hasChange: undefined,
      sub: undefined,
    }
  )
  // filter out events that don't change anything
  .filter(({ hasChange }) => {
    // console.log({ hasChange });
    return hasChange;
  })
  // show loader when there is definitely a change incoming
  .do(() => {
    loading.style.visibility = "visible";
  })
  // pass along data and make sure image is preloaded
  .switchMap(({ index, images }) => {
    const url = images[index];
    // console.log({ urlToLoad: url });

    return Observable.combineLatest(
      Observable.of({ index, count: images.length }),
      imagePreload$(url)
    );
  })
  .map(([{ index, count }, url]) => {
    // console.warn({ index, count, url });
    return { index, count, url };
  });

currentImageChange$.subscribe({
  next({ index, count, url }) {
    // hide the loading image
    loading.style.visibility = "hidden";

    counter.innerHTML = `${index + 1}/${count}`;
    // console.log("result", { loadedImage: url });

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
// observable that notifies whenever a user performs an action,
// like changing the sub or navigating the images

// each user action stream will start a new image load stream, and a loading placeholder should be shown, then when image is loaded, the placeholder should be hidden (which is done by the other stream)
/*
const actions = Observable.merge(backClick$, nextClick$, subChange$);

actions.subscribe(() => {
  loading.style.visibility = "visible";
});
*/
