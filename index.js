const nextButtonElement = document.getElementById("next");
const backButtonElement = document.getElementById("back");
const subSelectElement = document.getElementById("sub");
const currentImageElement = document.getElementById("img");
const loadingImageElement = document.getElementById("loading");
const counterElement = document.getElementById("counter");

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
  const cachedImages = localStorage.getItem(sub);
  if (cachedImages) {
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
            localStorage.setItem(sub, JSON.stringify(images)); // local cache
            return images;
          })
          .catch((e) => {
            throw Error(JSON.stringify(e));
          })
      )
    );
  }
}

// ---------------------- INSERT CODE  HERE ---------------------------
// This "images" Observable is a dummy. Replace it with a stream of each
// image in the current sub which is navigated by the user.

// user action streams
const backClick$ = Observable.fromEvent(backButtonElement, "click").share();
const nextClick$ = Observable.fromEvent(nextButtonElement, "click").share();
const subChange$ = Observable.fromEvent(subSelectElement, "change").share();
const subNameChange$ = Observable.concat(
  Observable.of(subSelectElement.value), // initial sub
  subChange$.map((e) => e.target.value)
);

const loadImageToElement = (element, url) => {};

/** Util to create an image preload observable */
const preloadImage = (url) => {
  return (
    new Observable((observer) => {
      const tempImagePreloadElement = new Image();
      tempImagePreloadElement.onerror = function (event) {
        observer.error({ url, event, message: "image load error" });
      };
      tempImagePreloadElement.onload = function () {
        observer.next(url);
        observer.complete();
      };

      // start image loading
      tempImagePreloadElement.src = url;

      // unsubscription function
      return () => {
        // stops image loading and removes listeners
        tempImagePreloadElement.onerror = null;
        tempImagePreloadElement.onload = null;
        tempImagePreloadElement.src = "";
      };
    })
      // retry twice before actually throwing if loading failed
      .retry(2)
      // use fallback if it really failed to load
      .catch((error) => {
        console.error(error);
        return Observable.of(LOADING_ERROR_URL);
      })
  );
};

/** Stream of image navigation actions mapped to codes */
const navigationActionCode$ = Observable.merge(
  backClick$.map((e) => -1),
  nextClick$.map((e) => 1),
  subNameChange$.map((e) => 0)
  // todo add keyboard actions
);

/** API call to get image url array */
const imageListLoad$ = subNameChange$.switchMap((sub) => {
  // if getting the images fails, retries up to 3 times before actually throwing
  return getSubImages(sub).retry(3);
});

/** Stream of image changes, gets the latest value of each stream */
const currentImageChange$ = Observable.combineLatest(
  navigationActionCode$,
  imageListLoad$,
  subNameChange$
)
  .do(() => console.log("---------------------"))
  .map(([actionCode, images, sub]) => {
    return { actionCode: actionCode, images, sub };
  })
  .scan(
    (oldAccumulatedState, newIncomingState) => {
      // from previous observable
      const { actionCode, images: newImages, sub: newSub } = newIncomingState;

      // from last return of this observable
      const {
        index: oldIndex,
        images: oldImages,
        sub: oldSub,
      } = oldAccumulatedState;

      const boundIndexToLimits = (newIndex) =>
        Math.min(Math.max(newIndex, 0), newImages.length - 1);

      // new index, if it is 0 then this means go to initial index
      const INITIAL_INDEX = 0;
      const newIndex =
        actionCode === 0
          ? INITIAL_INDEX
          : boundIndexToLimits(oldIndex + actionCode);

      const indexOrSubHasChanged = oldIndex !== newIndex || oldSub !== newSub;

      return {
        index: newIndex,
        sub: newSub,
        images: [...newImages],
        hasChange: indexOrSubHasChanged,
      };
    },
    {
      index: undefined,
      images: undefined,
      hasChange: undefined,
      sub: undefined,
      navigationVal: 0,
    }
  )
  // filter out events that don't change anything
  .filter(({ hasChange }) => hasChange)
  // show loader when there is definitely a change incoming
  .do(() => {
    loadingImageElement.style.visibility = "visible";
  })
  // pass along data and make sure image is preloaded
  .switchMap(({ index, images }) => {
    const url = images[index];

    // waits for the image to preload
    return Observable.combineLatest(
      Observable.of({ index, count: images.length }),
      preloadImage(url)
    );
  })
  .map(([{ index, count }, url]) => {
    return { index, count, url };
  });

currentImageChange$.subscribe({
  next({ index, count, url }) {
    counterElement.innerText = `${index + 1}/${count}`;

    // set the pre-loaded image source to the current image URL
    currentImageElement.src = url;
    loadingImageElement.style.visibility = "hidden";
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
